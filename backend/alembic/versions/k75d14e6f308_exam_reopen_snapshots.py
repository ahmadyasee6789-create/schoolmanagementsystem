"""Append-only snapshots for explicit administrative exam reopening. Review before applying."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from app.db.exam_snapshot_security_v1 import EXAM_SNAPSHOT_SECURITY_SQL

revision = "k75d14e6f308"
down_revision = "j64c03d5e297"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name != "postgresql" or op.get_context().as_sql:
        raise RuntimeError("Requires a reviewed online PostgreSQL migration")
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.create_unique_constraint("uq_exam_snapshot_owner", "exams", ["id", "organization_id"])
    op.create_table("exam_reopen_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("exam_id", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("snapshot_sha256", sa.String(64), nullable=False),
        sa.ForeignKeyConstraint(["exam_id", "organization_id"], ["exams.id", "exams.organization_id"], name="fk_exam_snapshot_owner", ondelete="RESTRICT"),
        sa.CheckConstraint("length(trim(reason)) BETWEEN 1 AND 1000", name="ck_exam_snapshot_reason"),
        sa.CheckConstraint("length(snapshot_sha256) = 64", name="ck_exam_snapshot_hash"),
    )
    op.create_index("ix_exam_snapshot_history", "exam_reopen_snapshots", ["organization_id", "exam_id", "id"])
    for statement in EXAM_SNAPSHOT_SECURITY_SQL:
        op.execute(statement)


def downgrade():
    raise RuntimeError("Downgrade would discard immutable examination history; use reviewed recovery")
