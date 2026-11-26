from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Engine, create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


def make_engine(url: str) -> Engine:
    if url.startswith("sqlite"):
        kwargs: dict = {"connect_args": {"check_same_thread": False}}
        if ":memory:" in url:
            kwargs["poolclass"] = StaticPool
        return create_engine(url, **kwargs)
    return create_engine(url, pool_pre_ping=True)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(engine, expire_on_commit=False)


@event.listens_for(Session, "after_begin")
def _bind_rls_player(session: Session, _transaction, connection) -> None:
    player_id = session.info.get("player_id")
    if player_id and connection.dialect.name == "postgresql":
        connection.execute(
            text("select set_config('app.player_id', :p, true)"), {"p": str(player_id)}
        )


def get_db(request: Request) -> Iterator[Session]:
    db = request.app.state.session_factory()
    try:
        yield db
    finally:
        db.close()
