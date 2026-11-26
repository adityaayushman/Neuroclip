from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://neuroclip:neuroclip@localhost:5432/neuroclip"
    redis_url: str = ""
    anthropic_api_key: str = ""
    mentor_model: str = "claude-haiku-5-5"
    cors_origins: str = "http://localhost:5173"
    auto_create_tables: bool = False

    max_body_bytes: int = 1_000_000
    max_telemetry_events: int = 20_000
    rate_limit_per_minute: int = 120
    rate_limit_mentor_per_minute: int = 10
    rate_limit_players_per_hour: int = 20
    leaderboard_ttl_s: int = 30
