"""initial schema with row level security

Revision ID: 0001
Revises:
Create Date: 2026-11-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

JSONType = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
OWNER = "player_id::text = current_setting('app.player_id', true)"


def upgrade() -> None:
    op.create_table(
        "players",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("display_name", sa.String(24), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_players_token_hash", "players", ["token_hash"], unique=True)

    op.create_table(
        "runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("player_id", sa.Uuid(), sa.ForeignKey("players.id"), nullable=False),
        sa.Column("mode", sa.String(16), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("event_count", sa.Integer(), nullable=False),
        sa.Column("last_t_ms", sa.Integer(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("flagged", sa.Boolean(), nullable=False),
        sa.Column("flags", JSONType, nullable=False),
        sa.Column("breakdown", JSONType, nullable=True),
        sa.Column("summary", JSONType, nullable=True),
    )
    op.create_index("ix_runs_player_id", "runs", ["player_id"])
    op.create_index("ix_runs_leaderboard", "runs", ["status", "mode", "score"])

    op.create_table(
        "telemetry_chunks",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("run_id", sa.Uuid(), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("offset", sa.Integer(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("payload", JSONType, nullable=False),
        sa.UniqueConstraint("run_id", "offset", name="uq_chunk_run_offset"),
    )
    op.create_index("ix_telemetry_chunks_run_id", "telemetry_chunks", ["run_id"])

    if op.get_bind().dialect.name != "postgresql":
        return

    # Row Level Security. The API sets `app.player_id` per transaction (see app/db.py).
    # Players own their runs and telemetry; finished, unflagged runs are publicly readable
    # so the leaderboard works without a player context.
    op.execute("ALTER TABLE runs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE runs FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY runs_owner ON runs USING ({OWNER}) WITH CHECK ({OWNER})")
    op.execute(
        "CREATE POLICY runs_public_read ON runs FOR SELECT "
        "USING (status = 'finished' AND NOT flagged)"
    )
    op.execute("ALTER TABLE telemetry_chunks ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE telemetry_chunks FORCE ROW LEVEL SECURITY")
    owned_run = (
        "EXISTS (SELECT 1 FROM runs r WHERE r.id = telemetry_chunks.run_id "
        "AND r.player_id::text = current_setting('app.player_id', true))"
    )
    op.execute(
        f"CREATE POLICY telemetry_owner ON telemetry_chunks USING ({owned_run}) WITH CHECK ({owned_run})"
    )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP POLICY IF EXISTS telemetry_owner ON telemetry_chunks")
        op.execute("DROP POLICY IF EXISTS runs_public_read ON runs")
        op.execute("DROP POLICY IF EXISTS runs_owner ON runs")
    op.drop_table("telemetry_chunks")
    op.drop_table("runs")
    op.drop_table("players")
