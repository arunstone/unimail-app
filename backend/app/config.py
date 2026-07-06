from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://unimail:unimail@localhost:5432/unimail"

    # App auth
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 720  # 30 days

    # Token encryption at rest (Fernet key, generate with:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
    fernet_key: str = ""

    # CORS
    frontend_origin: str = "http://localhost:5173"

    # OAuth providers (leave empty to disable a provider's OAuth flow)
    google_client_id: str = ""
    google_client_secret: str = ""
    outlook_client_id: str = ""
    outlook_client_secret: str = ""
    yahoo_client_id: str = ""
    yahoo_client_secret: str = ""

    # Public URL of the backend, used to build OAuth redirect URIs
    backend_url: str = "http://localhost:8000"

    # Sync
    sync_interval_minutes: int = 5

    # System outgoing mail (verification emails). Leave SYSTEM_SMTP_HOST empty
    # to skip verification entirely (users are auto-verified on signup).
    system_smtp_host: str = ""
    system_smtp_port: int = 587
    system_smtp_username: str = ""
    system_smtp_password: str = ""
    system_smtp_from: str = ""  # defaults to system_smtp_username
    # Disable for an internal relay on the docker network (no TLS needed there)
    system_smtp_starttls: bool = True
    verify_token_expire_hours: int = 48
    reset_token_expire_hours: int = 2

    # S3-compatible attachment storage (MinIO). Leave S3_ENDPOINT empty to
    # disable — downloads then fall back to on-demand IMAP fetches.
    s3_endpoint: str = ""
    s3_bucket: str = "unimail-attachments"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"

    # Ollama for graph embeddings (falls back to TF-IDF when unreachable)
    ollama_url: str = "http://ollama:11434"
    embedding_model: str = "nomic-embed-text"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
