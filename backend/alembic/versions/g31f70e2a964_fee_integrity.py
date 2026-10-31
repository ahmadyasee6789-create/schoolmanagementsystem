"""Preserve fee history and enforce atomic collection invariants.

Revision ID: g31f70e2a964
Revises: f8a29d10c6b4

Online PostgreSQL migration. Preflight fails without changing historical data.
Run during a maintenance window with writers stopped and a verified backup.
"""
from alembic import op
import sqlalchemy as sa

revision = "g31f70e2a964"
down_revision = "f8a29d10c6b4"
branch_labels = None
depends_on = None

MONEY_COLUMNS = (
    "admission_fee", "monthly_fee", "exam_fee", "total_amount",
    "discount_amount", "final_amount", "paid_amount",
)
FEE_CHECKS = {
    "ck_student_fee_charges": "admission_fee BETWEEN 0 AND 999999999999.99 AND monthly_fee BETWEEN 0 AND 999999999999.99 AND exam_fee BETWEEN 0 AND 999999999999.99 AND total_amount BETWEEN 0 AND 999999999999.99",
    "ck_student_fee_discount_percent": "discount_percent >= 0 AND discount_percent <= 100",
    "ck_student_fee_gross": "total_amount = admission_fee + monthly_fee + exam_fee",
    "ck_student_fee_net": "discount_amount >= 0 AND discount_amount <= total_amount AND final_amount = total_amount - discount_amount",
    "ck_student_fee_paid": "paid_amount >= 0 AND paid_amount <= final_amount",
    "ck_student_fee_status": "status IN ('unpaid', 'partial', 'paid')",
}


def _invalid_number(column, upper="999999999999.99", nullable=False):
    numeric = f"{column}::numeric"
    invalid = (f"({numeric}::text IN ('NaN', 'Infinity', '-Infinity') OR "
               f"{numeric} < 0 OR {numeric} > {upper} OR "
               f"{numeric} <> round({numeric}, 2))")
    return invalid if nullable else f"({column} IS NULL OR {invalid})"


def _preflight(bind):
    checks = {
        "duplicate student/session/month charges": """
            SELECT count(*) FROM (SELECT 1 FROM student_fees
            GROUP BY organization_id, student_id, session_id, month HAVING count(*) > 1) duplicates
        """,
        "invalid fee amounts or precision": "SELECT count(*) FROM student_fees WHERE " + " OR ".join(
            [_invalid_number(c) for c in MONEY_COLUMNS] + [_invalid_number("discount_percent", "100")]
        ),
        "inconsistent fee breakdown or balance": """
            SELECT count(*) FROM student_fees WHERE
            total_amount::numeric <> admission_fee::numeric + monthly_fee::numeric + exam_fee::numeric
            OR discount_amount > total_amount OR final_amount <> total_amount::numeric - discount_amount
            OR paid_amount > final_amount OR status IS NULL OR status NOT IN ('unpaid', 'partial', 'paid')
        """,
        "invalid transaction amounts": "SELECT count(*) FROM fee_transactions WHERE amount <= 0 OR " + _invalid_number("amount"),
        "paid balances differing from transaction history": """
            SELECT count(*) FROM student_fees f LEFT JOIN
            (SELECT student_fee_id, sum(amount) AS paid FROM fee_transactions GROUP BY student_fee_id) t
            ON t.student_fee_id = f.id WHERE f.paid_amount::numeric <> coalesce(t.paid, 0)
        """,
        "fee or transaction tenant mismatch": """
            SELECT count(*) FROM student_fees f
            JOIN students s ON s.id=f.student_id JOIN classrooms c ON c.id=f.class_id
            JOIN academic_sessions a ON a.id=f.session_id
            WHERE f.organization_id<>s.organization_id OR f.organization_id<>c.organization_id
            OR f.organization_id<>a.organization_id OR EXISTS
            (SELECT 1 FROM fee_transactions t WHERE t.student_fee_id=f.id AND t.organization_id<>f.organization_id)
        """,
        "invalid enrollment discounts": "SELECT count(*) FROM student_enrollments WHERE " + _invalid_number("discount_percent", "100", nullable=True),
        "invalid fee structure amounts": "SELECT count(*) FROM fee_structures WHERE " + " OR ".join(
            _invalid_number(c, "99999999.99") for c in ("admission_fee", "monthly_fee", "exam_fee")
        ),
        "fee structure classroom/session tenant mismatch": """
            SELECT count(*) FROM fee_structures f JOIN classrooms c ON c.id=f.class_id
            JOIN academic_sessions a ON a.id=f.session_id JOIN grades g ON g.id=c.grade_id
            WHERE f.organization_id<>c.organization_id OR f.organization_id<>a.organization_id
            OR f.organization_id<>g.organization_id OR c.academic_year_id<>f.session_id
        """,
    }
    issues = []
    for label, query in checks.items():
        count = bind.execute(sa.text(query)).scalar_one()
        if count:
            issues.append(f"{label}: {count}")
    if issues:
        raise RuntimeError("Fee integrity preflight refused migration; reconcile existing records explicitly first. " + "; ".join(issues))


def _replace_fk(bind, table, column, target, name, ondelete=None):
    # Support databases whose existing constraints were given custom names.
    foreign_keys = sa.inspect(bind).get_foreign_keys(table)
    match = [fk for fk in foreign_keys if fk["constrained_columns"] == [column]]
    if len(match) != 1 or not match[0]["name"]:
        raise RuntimeError(f"Expected one named foreign key for {table}.{column}")
    op.drop_constraint(match[0]["name"], table, type_="foreignkey")
    op.create_foreign_key(name, table, target, [column], ["id"], ondelete=ondelete)


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        raise RuntimeError("Fee integrity migration requires online PostgreSQL preflight")
    # Fail quickly when an active writer prevents obtaining the maintenance lock.
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute("LOCK TABLE student_fees, fee_transactions, student_enrollments, fee_structures IN ACCESS EXCLUSIVE MODE")
    _preflight(bind)
    for column in MONEY_COLUMNS:
        op.alter_column("student_fees", column, type_=sa.Numeric(14, 2), nullable=False,
                        postgresql_using=f"{column}::numeric(14,2)")
    op.alter_column("student_fees", "discount_percent", nullable=False)
    op.alter_column("student_fees", "status", nullable=False)
    op.alter_column("student_enrollments", "discount_percent", type_=sa.Numeric(5, 2),
                    postgresql_using="discount_percent::numeric(5,2)")
    op.alter_column("fee_transactions", "amount", type_=sa.Numeric(14, 2),
                    postgresql_using="amount::numeric(14,2)")
    op.add_column("fee_transactions", sa.Column("idempotency_key", sa.String(128), nullable=True))
    op.add_column("fee_transactions", sa.Column("paid_amount_after", sa.Numeric(14, 2), nullable=True))
    op.add_column("fee_transactions", sa.Column("fee_status_after", sa.String(), nullable=True))
    op.create_unique_constraint("uq_fee_payment_idempotency", "fee_transactions", ["organization_id", "idempotency_key"])
    op.create_unique_constraint("uq_student_fee_period", "student_fees", ["organization_id", "student_id", "session_id", "month"])
    for name, condition in FEE_CHECKS.items():
        op.create_check_constraint(name, "student_fees", condition)
    op.create_check_constraint("ck_enrollment_discount_percent", "student_enrollments", "discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)")
    op.create_check_constraint("ck_fee_structure_amounts", "fee_structures", "admission_fee BETWEEN 0 AND 99999999.99 AND monthly_fee BETWEEN 0 AND 99999999.99 AND exam_fee BETWEEN 0 AND 99999999.99")
    op.create_check_constraint("ck_fee_transaction_amount", "fee_transactions", "amount > 0 AND amount <= 999999999999.99")
    op.create_check_constraint("ck_fee_transaction_snapshot", "fee_transactions", "idempotency_key IS NULL OR (paid_amount_after IS NOT NULL AND paid_amount_after BETWEEN amount AND 999999999999.99 AND fee_status_after IS NOT NULL AND fee_status_after IN ('partial', 'paid'))")
    _replace_fk(bind, "student_fees", "student_id", "students", "fk_student_fee_student_history", "RESTRICT")
    _replace_fk(bind, "fee_transactions", "student_fee_id", "student_fees", "fk_fee_transaction_fee_history", "RESTRICT")


def downgrade():
    # Dropping stored request keys would make retries unsafe; converting cents
    # back to integer balances would destroy accounting information.
    raise RuntimeError(
        "Automatic downgrade is intentionally disabled to preserve payment keys and exact money. "
        "Keep this schema when rolling back application code; use a reviewed backup/reconciliation plan for schema rollback."
    )
