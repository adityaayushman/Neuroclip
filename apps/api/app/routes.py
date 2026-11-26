import json
import uuid
import zlib
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import mentor
from .db import get_db
from .models import Player, Run, TelemetryChunk
from .schemas import (
    DebriefOut,
    LeaderboardEntry,
    LeaderboardOut,
    MentorAsk,
    Mode,
    PlayerCreate,
    PlayerOut,
    SessionCreate,
    SessionOut,
    TelemetryAck,
    TelemetryBatch,
)
from .scoring import score_run
from .security import get_player, hash_token, new_token, rate_limit

router = APIRouter(prefix="/v1")
general_limit = rate_limit("general", "rate_limit_per_minute", 60, per_player=True)


async def read_body(request: Request) -> bytes:
    limit = request.app.state.settings.max_body_bytes
    raw = b""
    async for chunk in request.stream():
        raw += chunk
        if len(raw) > limit:
            raise HTTPException(413, "Body too large")
    if request.headers.get("content-encoding", "").lower() == "gzip":
        d = zlib.decompressobj(16 + zlib.MAX_WBITS)
        try:
            out = d.decompress(raw, limit + 1)
        except zlib.error as e:
            raise HTTPException(400, "Invalid gzip body") from e
        if len(out) > limit or d.unconsumed_tail:
            raise HTTPException(413, "Decompressed body too large")
        raw = out
    return raw


def _owned_run(db: Session, run_id: uuid.UUID, player: Player) -> Run:
    run = db.scalar(select(Run).where(Run.id == run_id, Run.player_id == player.id))
    if run is None:
        raise HTTPException(404, "Session not found")
    return run


def _rank(db: Session, run: Run) -> int | None:
    if run.flagged or run.score is None or run.status != "finished":
        return None
    better = db.scalar(
        select(func.count())
        .select_from(Run)
        .where(
            Run.status == "finished",
            Run.flagged.is_(False),
            Run.mode == run.mode,
            Run.score > run.score,
        )
    )
    return (better or 0) + 1


def _debrief(db: Session, run: Run) -> DebriefOut:
    return DebriefOut(
        run_id=run.id,
        mode=run.mode,
        status=run.status,
        score=run.score or 0,
        breakdown=run.breakdown or {"completion": 0, "safety": 0, "blood": 0, "efficiency": 0},
        summary=run.summary or {},
        flagged=run.flagged,
        flags=run.flags or [],
        ml_skill=None,
        rank=_rank(db, run),
    )


@router.post(
    "/players",
    response_model=PlayerOut,
    status_code=201,
    dependencies=[Depends(rate_limit("players", "rate_limit_players_per_hour", 3600))],
)
def create_player(body: PlayerCreate, db: Session = Depends(get_db)) -> PlayerOut:
    token = new_token()
    player = Player(display_name=body.display_name, token_hash=hash_token(token))
    db.add(player)
    db.commit()
    return PlayerOut(player_id=player.id, token=token)


@router.post(
    "/sessions", response_model=SessionOut, status_code=201, dependencies=[Depends(general_limit)]
)
def create_session(
    body: SessionCreate, player: Player = Depends(get_player), db: Session = Depends(get_db)
) -> SessionOut:
    run = Run(player_id=player.id, mode=body.mode, seed=body.seed)
    db.add(run)
    db.commit()
    return SessionOut(session_id=run.id)


@router.post(
    "/sessions/{session_id}/telemetry",
    response_model=TelemetryAck,
    dependencies=[Depends(general_limit)],
)
def upload_telemetry(
    session_id: uuid.UUID,
    request: Request,
    raw: bytes = Depends(read_body),
    player: Player = Depends(get_player),
    db: Session = Depends(get_db),
) -> TelemetryAck:
    try:
        batch = TelemetryBatch.model_validate_json(raw)
    except ValidationError as e:
        raise HTTPException(422, json.loads(e.json(include_url=False))) from e
    run = _owned_run(db, session_id, player)
    if run.status != "active":
        raise HTTPException(409, "Session already finished")
    if batch.offset != run.event_count:
        raise HTTPException(409, f"Offset mismatch, expected {run.event_count}")
    if run.event_count + len(batch.events) > request.app.state.settings.max_telemetry_events:
        raise HTTPException(413, "Too many telemetry events")
    times = [e.t for e in batch.events]
    if times != sorted(times) or times[0] < run.last_t_ms:
        raise HTTPException(422, "Telemetry timestamps must be non-decreasing")
    db.add(
        TelemetryChunk(
            run_id=run.id,
            offset=batch.offset,
            count=len(batch.events),
            payload=[e.model_dump() for e in batch.events],
        )
    )
    run.event_count += len(batch.events)
    run.last_t_ms = times[-1]
    db.commit()
    return TelemetryAck(accepted=len(batch.events), next_offset=run.event_count)


@router.post(
    "/sessions/{session_id}/finish", response_model=DebriefOut, dependencies=[Depends(general_limit)]
)
def finish_session(
    session_id: uuid.UUID,
    request: Request,
    player: Player = Depends(get_player),
    db: Session = Depends(get_db),
) -> DebriefOut:
    run = _owned_run(db, session_id, player)
    if run.status == "finished":
        return _debrief(db, run)
    chunks = db.scalars(
        select(TelemetryChunk).where(TelemetryChunk.run_id == run.id).order_by(TelemetryChunk.offset)
    ).all()
    events = [e for c in chunks for e in c.payload]
    result = score_run(events)
    run.status = "finished"
    run.finished_at = datetime.now(UTC)
    run.score = result.score
    run.breakdown = result.breakdown
    run.summary = result.summary
    run.flags = result.flags
    run.flagged = result.flagged
    run.duration_ms = result.summary["duration_ms"]
    db.commit()
    request.app.state.cache.delete_prefix("lb:")
    return _debrief(db, run)


@router.get(
    "/sessions/{session_id}/debrief", response_model=DebriefOut, dependencies=[Depends(general_limit)]
)
def get_debrief(
    session_id: uuid.UUID, player: Player = Depends(get_player), db: Session = Depends(get_db)
) -> DebriefOut:
    run = _owned_run(db, session_id, player)
    if run.status != "finished":
        raise HTTPException(409, "Session not finished")
    return _debrief(db, run)


@router.get("/leaderboard", response_model=LeaderboardOut)
def leaderboard(
    request: Request, mode: Mode | None = None, limit: int = 10, db: Session = Depends(get_db)
) -> LeaderboardOut:
    limit = max(1, min(limit, 50))
    cache = request.app.state.cache
    key = f"lb:{mode or 'all'}:{limit}"
    cached = cache.get(key)
    if cached is not None:
        return LeaderboardOut.model_validate(cached)
    q = (
        select(Run, Player.display_name)
        .join(Player, Player.id == Run.player_id)
        .where(Run.status == "finished", Run.flagged.is_(False))
        .order_by(Run.score.desc(), Run.duration_ms.asc(), Run.finished_at.asc())
        .limit(limit)
    )
    if mode:
        q = q.where(Run.mode == mode)
    entries = [
        LeaderboardEntry(
            rank=i + 1,
            display_name=name,
            score=run.score or 0,
            duration_ms=run.duration_ms or 0,
            mode=run.mode,
            run_id=run.id,
        )
        for i, (run, name) in enumerate(db.execute(q).all())
    ]
    out = LeaderboardOut(mode=mode, entries=entries)
    cache.set(key, out.model_dump(mode="json"), request.app.state.settings.leaderboard_ttl_s)
    return out


@router.post(
    "/mentor/ask",
    dependencies=[Depends(rate_limit("mentor", "rate_limit_mentor_per_minute", 60))],
)
def mentor_ask(body: MentorAsk, request: Request) -> StreamingResponse:
    stream = mentor.answer_stream(request.app.state.settings, body.question, body.step)
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
