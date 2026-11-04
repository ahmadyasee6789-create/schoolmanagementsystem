"""Append-only approved discounts for full yearly settlements; do not apply automatically."""
from alembic import op
import sqlalchemy as sa

revision = "j64c03d5e297"
down_revision = "i53b92a4c186"
branch_labels = None
depends_on = None


def upgrade():
    if op.get_bind().dialect.name != "postgresql" or op.get_context().as_sql:
        raise RuntimeError("Requires a reviewed online PostgreSQL migration")
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.create_unique_constraint("uq_fee_command_owner", "fee_collection_commands", ["id", "organization_id", "student_id", "session_id"])
    op.create_table(
        "fee_yearly_discounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("student_fee_id", sa.Integer(), nullable=False),
        sa.Column("collection_command_id", sa.Integer(), nullable=False),
        sa.Column("discount_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("student_fee_id", name="uq_fee_yearly_discount_fee"),
        sa.ForeignKeyConstraint(["student_fee_id", "organization_id", "student_id", "session_id"],
                                ["student_fees.id", "student_fees.organization_id", "student_fees.student_id", "student_fees.session_id"],
                                name="fk_fee_yearly_discount_fee", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["collection_command_id", "organization_id", "student_id", "session_id"],
                                ["fee_collection_commands.id", "fee_collection_commands.organization_id", "fee_collection_commands.student_id", "fee_collection_commands.session_id"],
                                name="fk_fee_yearly_discount_command", ondelete="RESTRICT"),
        sa.CheckConstraint("discount_percent > 0 AND discount_percent <= 100", name="ck_fee_yearly_discount_percent"),
        sa.CheckConstraint("amount > 0 AND amount <= 999999999999.99", name="ck_fee_yearly_discount_amount"),
    )
    op.execute("ALTER TABLE fee_yearly_discounts ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON TABLE fee_yearly_discounts FROM PUBLIC")
    op.execute("REVOKE ALL ON SEQUENCE fee_yearly_discounts_id_seq FROM PUBLIC")
    op.execute("""DO $yearly_discount_access$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
            REVOKE ALL ON TABLE fee_yearly_discounts FROM anon;
            REVOKE ALL ON SEQUENCE fee_yearly_discounts_id_seq FROM anon;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
            REVOKE ALL ON TABLE fee_yearly_discounts FROM authenticated;
            REVOKE ALL ON SEQUENCE fee_yearly_discounts_id_seq FROM authenticated;
        END IF;
    END $yearly_discount_access$""")


def downgrade():
    raise RuntimeError("Automatic downgrade would discard yearly-discount audit history; use reviewed recovery")
