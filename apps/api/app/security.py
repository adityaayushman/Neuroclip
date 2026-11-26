import hashlib
import secrets
from collections.abc import Callable

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import Player


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def get_player(
    db: Session = Depends(get_db), authorization: str | None = Header(default=None)
) -> Player:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Missing bearer token")
    player = db.scalar(select(Player).where(Player.token_hash == hash_token(token)))
    if player is None:
        raise HTTPException(401, "Invalid token")
    db.commit()
    db.info["player_id"] = str(player.id)
    return player


def rate_limit(name: str, setting: str, window_s: int, per_player: bool = False) -> Callable:
    def dep(request: Request, authorization: str | None = Header(default=None)) -> None:
        state = request.app.state
        limit: int = getattr(state.settings, setting)
        ident = (authorization or "")[-16:] if per_player and authorization else None
        ident = ident or (request.client.host if request.client else "unknown")
        count = state.cache.incr(f"rl:{name}:{ident}", window_s)
        if count > limit:
            raise HTTPException(429, "Rate limit exceeded", headers={"Retry-After": str(window_s)})

    return dep
