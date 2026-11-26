from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .cache import make_cache
from .config import Settings
from .db import make_engine, make_session_factory
from .models import Base
from .routes import router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="NeuroClip API", version="0.1.0")
    engine = make_engine(settings.database_url)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)
    app.state.cache = make_cache(settings.redis_url)
    if settings.auto_create_tables:
        Base.metadata.create_all(engine)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type", "Content-Encoding"],
    )
    app.include_router(router)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready")
    def ready() -> dict[str, str]:
        try:
            with engine.connect() as conn:
                conn.execute(text("select 1"))
        except Exception as e:
            raise HTTPException(503, "database unavailable") from e
        return {"status": "ok"}

    return app


app = create_app()
