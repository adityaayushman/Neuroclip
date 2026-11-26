import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Mode = Literal["guided", "expert", "emergency"]
Step = Literal[
    "positioning_craniotomy",
    "dural_opening",
    "sylvian_dissection",
    "neck_parent_exposure",
    "clip_placement",
    "doppler_closure",
]
Tool = Literal[
    "suction",
    "bipolar",
    "microscissors",
    "dissector",
    "retractor",
    "irrigation",
    "cottonoid",
    "temporary_clip",
    "clip_applier",
    "doppler",
]
Scalar = str | int | float | bool | None
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[\w .\-]{1,24}$")]
MAX_T_MS = 4 * 60 * 60 * 1000


class PlayerCreate(BaseModel):
    display_name: DisplayName


class PlayerOut(BaseModel):
    player_id: uuid.UUID
    token: str


class SessionCreate(BaseModel):
    mode: Mode
    seed: int = Field(default=1, ge=0, le=2**31 - 1)


class SessionOut(BaseModel):
    session_id: uuid.UUID


class TelemetryEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    t: int = Field(ge=0, le=MAX_T_MS)
    step: Step
    tool: Tool | None = None
    kind: Annotated[str, StringConstraints(pattern=r"^[a-z_]{1,24}$")]
    data: dict[Annotated[str, StringConstraints(max_length=24)], Scalar] | None = Field(
        default=None, max_length=24
    )


class TelemetryBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    offset: int = Field(ge=0)
    events: list[TelemetryEvent] = Field(min_length=1, max_length=5000)


class TelemetryAck(BaseModel):
    accepted: int
    next_offset: int


class Breakdown(BaseModel):
    completion: int
    safety: int
    blood: int
    efficiency: int


class DebriefOut(BaseModel):
    run_id: uuid.UUID
    mode: Mode
    status: str
    score: int
    breakdown: Breakdown
    summary: dict
    flagged: bool
    flags: list[str]
    ml_skill: float | None = None
    rank: int | None = None


class LeaderboardEntry(BaseModel):
    rank: int
    display_name: str
    score: int
    duration_ms: int
    mode: Mode
    run_id: uuid.UUID


class LeaderboardOut(BaseModel):
    mode: Mode | None
    entries: list[LeaderboardEntry]


class MentorAsk(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    step: Step | None = None
