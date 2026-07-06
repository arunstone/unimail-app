import { useCallback, useEffect, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { api } from '../../api/client'
import { PROVIDER_COLORS, truncate } from '../../lib/utils'
import { useAccountsStore } from '../../stores/accountsStore'
import { useTabsStore } from '../../stores/tabsStore'
import EmptyState from '../common/EmptyState'
import type { Provider } from '../../types'

interface GraphNode {
  id: string
  subject: string
  from_name: string
  from_email: string
  folder_role: string
  account_id: string
  provider: Provider
  received_at: string
  is_read: boolean
  // injected by force-graph at runtime
  x?: number
  y?: number
}

interface GraphEdge {
  source: string
  target: string
  weight: number
}

export default function GraphView() {
  const [data, setData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null)
  const [search, setSearch] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const accounts = useAccountsStore((s) => s.accounts)
  const openTab = useTabsStore((s) => s.openTab)

  // debounce server fetch while typing
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (search) params.set('search', search)
        if (accountFilter) params.set('account_id', accountFilter)
        const res = await api.get<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
          `/api/graph?${params}`,
        )
        setData(res)
      } finally {
        setLoading(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [search, accountFilter])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () =>
      setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const openEmail = useCallback(
    (node: GraphNode) => {
      openTab({
        kind: 'email',
        key: `email:${node.id}`,
        title: truncate(node.subject, 30),
        location: { view: 'email', emailId: node.id, subject: node.subject },
        crumbPrefix: [{ label: 'Graph', loc: { view: 'graph' } }],
      })
    },
    [openTab],
  )

  const drawNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const r = node.is_read ? 4 : 6
      ctx.beginPath()
      ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
      ctx.fillStyle = PROVIDER_COLORS[node.provider] ?? '#64748b'
      ctx.globalAlpha = node.is_read ? 0.55 : 1
      ctx.fill()
      ctx.globalAlpha = 1
      if (scale > 1.4) {
        ctx.font = `${10 / scale}px Inter, sans-serif`
        ctx.fillStyle = '#7c8099'
        ctx.textAlign = 'center'
        ctx.fillText(truncate(node.subject, 36), node.x!, node.y! + r + 10 / scale)
      }
    },
    [],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-divider px-4 py-2">
        <span className="text-subhead">🕸</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by keyword — e.g. invoice, meeting, project…"
          className="w-72 rounded-md border border-divider bg-app px-3 py-1.5 text-body text-primary outline-none placeholder:text-muted focus:border-accent"
        />
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="rounded-md border border-divider bg-app px-2 py-1.5 text-body text-primary outline-none focus:border-accent"
        >
          <option value="">All Accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.email_address}
            </option>
          ))}
        </select>
        <span className="ml-auto font-mono text-caption text-muted">
          {loading
            ? 'computing…'
            : data
              ? `${data.nodes.length} emails · ${data.edges.length} connections`
              : ''}
        </span>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        {data && data.nodes.length === 0 && !loading ? (
          <EmptyState
            icon="🕸"
            title={search ? 'No emails match that keyword' : 'Nothing to map yet'}
            hint={search ? 'Try a different search term.' : 'Connect an account and let it sync first.'}
          />
        ) : data ? (
          <ForceGraph2D
            width={size.w}
            height={size.h}
            backgroundColor="#13151a"
            graphData={{
              nodes: data.nodes,
              links: data.edges.map((e) => ({ ...e })),
            }}
            nodeId="id"
            nodeLabel={(n) =>
              `<div style="max-width:260px"><b>${(n as GraphNode).subject}</b><br/>` +
              `${(n as GraphNode).from_name || (n as GraphNode).from_email}<br/>` +
              `<span style="color:#7c8099">${new Date((n as GraphNode).received_at).toLocaleString()}</span></div>`
            }
            nodeCanvasObject={(n, ctx, scale) => drawNode(n as GraphNode, ctx, scale)}
            nodePointerAreaPaint={(n, color, ctx) => {
              ctx.beginPath()
              ctx.arc((n as GraphNode).x!, (n as GraphNode).y!, 8, 0, 2 * Math.PI)
              ctx.fillStyle = color
              ctx.fill()
            }}
            linkColor={() => '#2e3140'}
            linkWidth={(l) => 0.5 + ((l as unknown as GraphEdge).weight ?? 0.2) * 3}
            onNodeClick={(n) => openEmail(n as GraphNode)}
            cooldownTicks={120}
          />
        ) : null}
      </div>
    </div>
  )
}
