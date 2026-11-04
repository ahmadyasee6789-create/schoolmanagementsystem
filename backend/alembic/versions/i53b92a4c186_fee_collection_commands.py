"""Collection command idempotency and explicit confirmation of future rates.

Created for review only. Do not apply automatically. No financial row backfill.
"""
from alembic import op
import sqlalchemy as sa
from app.db.fee_command_security_v1 import COMMAND_SECURITY_SQL

revision = "i53b92a4c186"
down_revision = "h42a81f3b075"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name != "postgresql" or op.get_context().as_sql:
        raise RuntimeError("Requires a reviewed online PostgreSQL migration")
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.add_column("fee_structures", sa.Column("rates_finalized", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "fee_collection_commands",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_fingerprint", sa.String(64), nullable=False),
        sa.Column("response_snapshot", sa.JSON(none_as_null=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "idempotency_key", name="uq_fee_command_key"),
        sa.CheckConstraint("length(request_fingerprint)=64", name="ck_fee_command_fingerprint"),
        sa.ForeignKeyConstraint(["student_id", "organization_id"], ["students.id", "students.organization_id"],
                                name="fk_fee_command_student", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["session_id", "organization_id"], ["academic_sessions.id", "academic_sessions.organization_id"],
                                name="fk_fee_command_session", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["transaction_id", "organization_id", "student_id", "session_id"],
                                ["fee_transactions.id", "fee_transactions.organization_id", "fee_transactions.student_id", "fee_transactions.session_id"],
                                name="fk_fee_command_payment", ondelete="RESTRICT"),
    )
    op.create_index("ix_fee_command_owner", "fee_collection_commands", ["organization_id", "student_id", "session_id"])
    for statement in COMMAND_SECURITY_SQL:
        op.execute(statement)


def downgrade():
    raise RuntimeError("Automatic downgrade would discard collection audit history; use reviewed recovery")
