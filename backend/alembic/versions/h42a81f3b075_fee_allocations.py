"""Year-month obligations and allocation-backed receipts; no destructive downgrade.

Revision ID: h42a81f3b075
Revises: g31f70e2a964

Writers must be stopped. Run only after backup restoration and preflight review.
This revision was CREATED, NOT EXECUTED as part of Phase 1 implementation.
"""
from alembic import op
import sqlalchemy as sa

from app.db.fee_migration_v1 import prepare_legacy_fee_backfill
from app.db.fee_allocation_security_v1 import ALLOCATION_SECURITY_SQL

revision = "h42a81f3b075"
down_revision = "g31f70e2a964"
branch_labels = None
depends_on = None

SNAPSHOT_CHECK = (
    "idempotency_key IS NULL OR "
    "(student_fee_id IS NOT NULL AND paid_amount_after IS NOT NULL "
    "AND paid_amount_after BETWEEN amount AND 999999999999.99 "
    "AND fee_status_after IS NOT NULL AND fee_status_after IN ('partial', 'paid')) OR "
    "(student_fee_id IS NULL AND request_fingerprint IS NOT NULL AND response_snapshot IS NOT NULL)"
)


def verify_predecessor_schema(bind):
    inspector = sa.inspect(bind)
    required = {
        "student_fees": {"uq_student_fee_period": ("organization_id", "student_id", "session_id", "month")},
        "fee_transactions": {"uq_receipt_per_org": ("receipt_no", "organization_id"),
                             "uq_fee_payment_idempotency": ("organization_id", "idempotency_key")},
    }
    for table, constraints in required.items():
        actual = {c["name"]: tuple(c["column_names"]) for c in inspector.get_unique_constraints(table)}
        if any(actual.get(name) != columns for name, columns in constraints.items()):
            raise RuntimeError(f"Unexpected predecessor constraints on {table}; inspect before migration")
    for table, name, column, parent in (("student_fees", "fk_student_fee_student_history", "student_id", "students"),
                                        ("fee_transactions", "fk_fee_transaction_fee_history", "student_fee_id", "student_fees")):
        foreign_keys = {c["name"]: c for c in inspector.get_foreign_keys(table)}
        constraint = foreign_keys.get(name)
        if (constraint is None or constraint["options"].get("ondelete", "").upper() != "RESTRICT"
                or constraint["constrained_columns"] != [column] or constraint["referred_columns"] != ["id"]
                or constraint["referred_table"] != parent):
            raise RuntimeError(f"Expected restrictive history foreign key {name} is missing")


def verify_backfill(bind):
    checks = {
        "payment allocation mismatch": """
            SELECT t.id FROM fee_transactions t LEFT JOIN fee_allocations a ON a.transaction_id=t.id
            GROUP BY t.id HAVING count(a.id)<>1 OR coalesce(sum(a.amount),0)<>t.amount
            OR count(a.id) FILTER (WHERE a.student_fee_id=t.student_fee_id
                AND a.organization_id=t.organization_id AND a.student_id=t.student_id AND a.session_id=t.session_id)<>1
        """,
        "obligation balance mismatch": """
            SELECT f.id FROM student_fees f LEFT JOIN fee_allocations a ON a.student_fee_id=f.id
            GROUP BY f.id HAVING coalesce(sum(a.amount),0)<>f.paid_amount
        """,
    }
    for reason, statement in checks.items():
        ids = list(bind.execute(sa.text(statement)).scalars())
        if ids:
            raise RuntimeError(f"Backfill verification failed ({reason}): IDs {ids}")


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql" or op.get_context().as_sql:
        raise RuntimeError("This migration requires an online PostgreSQL transaction and reviewed preflight")
    op.execute("SET LOCAL lock_timeout = '10s'")
    # Lock referenced metadata too: the preflight and backfill must see one state.
    op.execute("LOCK TABLE organizations, students, academic_sessions, classrooms, grades, "
               "student_enrollments, student_fees, fee_transactions IN ACCESS EXCLUSIVE MODE")
    verify_predecessor_schema(bind)
    plan = prepare_legacy_fee_backfill(bind)  # All validation happens before DDL.

    op.add_column("student_fees", sa.Column("billing_period", sa.Date(), nullable=True))
    if plan["periods"]:
        bind.execute(sa.text("UPDATE student_fees SET billing_period=:period WHERE id=:id"), plan["periods"])
    op.alter_column("student_fees", "billing_period", nullable=False)
    op.create_check_constraint("ck_student_fee_period_start", "student_fees", "EXTRACT(day FROM billing_period)=1")
    # Install the stronger identity before removing the old month-name restriction.
    op.create_unique_constraint("uq_student_fee_billing_period", "student_fees",
                                ["organization_id", "student_id", "session_id", "billing_period"])
    op.drop_constraint("uq_student_fee_period", "student_fees", type_="unique")
    op.create_unique_constraint("uq_student_financial_owner", "students", ["id", "organization_id"])
    op.create_unique_constraint("uq_session_financial_owner", "academic_sessions", ["id", "organization_id"])
    owner = ["id", "organization_id", "student_id", "session_id"]
    op.create_unique_constraint("uq_student_fee_allocation_owner", "student_fees", owner)

    op.add_column("fee_transactions", sa.Column("student_id", sa.Integer(), nullable=True))
    op.add_column("fee_transactions", sa.Column("session_id", sa.Integer(), nullable=True))
    op.add_column("fee_transactions", sa.Column("request_fingerprint", sa.String(64), nullable=True))
    op.add_column("fee_transactions", sa.Column("response_snapshot", sa.JSON(none_as_null=True), nullable=True))
    op.execute("""UPDATE fee_transactions t SET student_id=f.student_id, session_id=f.session_id
                  FROM student_fees f WHERE f.id=t.student_fee_id AND f.organization_id=t.organization_id""")
    op.alter_column("fee_transactions", "student_id", nullable=False)
    op.alter_column("fee_transactions", "session_id", nullable=False)
    op.alter_column("fee_transactions", "student_fee_id", nullable=True)
    op.create_unique_constraint("uq_fee_transaction_allocation_owner", "fee_transactions", owner)
    op.create_foreign_key("fk_fee_transaction_student_owner", "fee_transactions", "students",
                          ["student_id", "organization_id"], ["id", "organization_id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_fee_transaction_session_owner", "fee_transactions", "academic_sessions",
                          ["session_id", "organization_id"], ["id", "organization_id"], ondelete="RESTRICT")
    op.drop_constraint("fk_fee_transaction_fee_history", "fee_transactions", type_="foreignkey")
    op.create_foreign_key("fk_fee_transaction_fee_history", "fee_transactions", "student_fees",
                          ["student_fee_id", "organization_id", "student_id", "session_id"], owner, ondelete="RESTRICT")
    op.drop_constraint("ck_fee_transaction_snapshot", "fee_transactions", type_="check")
    op.create_check_constraint("ck_fee_transaction_snapshot", "fee_transactions", SNAPSHOT_CHECK)
    op.create_check_constraint("ck_fee_request_fingerprint", "fee_transactions",
                               "request_fingerprint IS NULL OR length(request_fingerprint)=64")
    op.create_index("ix_fee_transaction_owner", "fee_transactions", ["organization_id", "student_id", "session_id"])

    allocations = op.create_table(
        "fee_allocations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("student_fee_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["transaction_id", "organization_id", "student_id", "session_id"],
                                 ["fee_transactions." + c for c in owner], name="fk_fee_allocation_payment_owner", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["student_fee_id", "organization_id", "student_id", "session_id"],
                                 ["student_fees." + c for c in owner], name="fk_fee_allocation_fee_owner", ondelete="RESTRICT"),
        sa.CheckConstraint("amount > 0 AND amount <= 999999999999.99", name="ck_fee_allocation_amount"),
    )
    op.create_index("ix_fee_allocation_payment", "fee_allocations", ["transaction_id"])
    op.create_index("ix_fee_allocation_fee", "fee_allocations", ["student_fee_id"])
    op.create_index("ix_fee_allocation_owner", "fee_allocations", ["organization_id", "student_id", "session_id"])
    for statement in ALLOCATION_SECURITY_SQL:
        op.execute(statement)
    if plan["allocations"]:
        bind.execute(allocations.insert(), plan["allocations"])
    verify_backfill(bind)  # A failure rolls back DDL and backfills in PostgreSQL.


def downgrade():
    raise RuntimeError("Automatic downgrade would discard allocation history. Use the reviewed backup/recovery procedure.")
