"""Account auto-setup: given an email address, find IMAP/SMTP settings the
way Thunderbird does — the Mozilla ISP database first, then the domain's
own autoconfig endpoint, then a port probe of common hostnames."""

import ipaddress
import logging
import socket
from xml.etree import ElementTree

import requests

logger = logging.getLogger("unimail.autoconfig")

HTTP_TIMEOUT = 6
PROBE_TIMEOUT = 4


def _public_host(host: str) -> bool:
    """Only talk to hosts that resolve exclusively to public addresses —
    the domain comes from user input, so guard against SSRF/port-scanning
    of the internal network."""
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if not ip.is_global:
            return False
    return True


def _username(raw: str | None, email: str) -> str:
    if raw == "%EMAILLOCALPART%":
        return email.partition("@")[0]
    if raw in (None, "", "%EMAILADDRESS%"):
        return email
    return raw


def _parse_config_xml(text: str, email: str) -> dict | None:
    try:
        root = ElementTree.fromstring(text)
    except ElementTree.ParseError:
        return None

    def pick(kind: str) -> ElementTree.Element | None:
        candidates = [s for s in root.iter(f"{kind}Server")
                      if s.get("type") in ("imap", "smtp")]
        # prefer implicit-TLS entries (port 993/465)
        for c in candidates:
            if (c.findtext("socketType") or "").upper() == "SSL":
                return c
        return candidates[0] if candidates else None

    imap = pick("incoming")
    smtp = pick("outgoing")
    if imap is None or imap.get("type") != "imap":
        return None
    result = {
        "imap_host": imap.findtext("hostname"),
        "imap_port": int(imap.findtext("port") or 993),
        "username": _username(imap.findtext("username"), email),
    }
    if smtp is not None:
        result["smtp_host"] = smtp.findtext("hostname")
        result["smtp_port"] = int(smtp.findtext("port") or 587)
    return result if result["imap_host"] else None


def _tcp_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=PROBE_TIMEOUT):
            return True
    except OSError:
        return False


def lookup(email: str) -> dict:
    domain = email.rpartition("@")[2].lower().strip()
    if not domain or "." not in domain:
        return {"found": False}

    # 1) Mozilla ISP database (covers thousands of providers)
    # 2) the domain's own autoconfig endpoint
    sources = [
        ("isp-db", f"https://autoconfig.thunderbird.net/v1.1/{domain}", None),
        ("autoconfig",
         f"https://autoconfig.{domain}/mail/config-v1.1.xml",
         {"emailaddress": email}),
    ]
    for source, url, params in sources:
        host = url.split("/")[2]
        if source != "isp-db" and not _public_host(host):
            continue
        try:
            resp = requests.get(url, params=params, timeout=HTTP_TIMEOUT)
        except requests.RequestException:
            continue
        if resp.status_code != 200:
            continue
        parsed = _parse_config_xml(resp.text, email)
        if parsed:
            return {"found": True, "source": source, **parsed}

    # 3) probe conventional hostnames
    result: dict = {"found": False, "source": "probe", "username": email}
    for host in (f"imap.{domain}", f"mail.{domain}"):
        if _public_host(host) and _tcp_open(host, 993):
            result.update(found=True, imap_host=host, imap_port=993)
            break
    if not result["found"]:
        return {"found": False}
    for host, port in ((f"smtp.{domain}", 587), (f"smtp.{domain}", 465),
                       (f"mail.{domain}", 587), (f"mail.{domain}", 465)):
        if _public_host(host) and _tcp_open(host, port):
            result.update(smtp_host=host, smtp_port=port)
            break
    return result
