"""Stage student imports for validation and idempotent confirmation.

Revision ID: e41b62a901df
Revises: d7c3f22d287b
"""
from alembic import op
import sqlalchemy as sa

revision = "e41b62a901df"
down_revision = "d7c3f22d287b"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "student_import_batches",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("academic_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("raw_sheets", sa.JSON(), nullable=False),
        sa.Column("validated_rows", sa.JSON(), nullable=True),
        sa.Column("validation_id", sa.String(36), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_student_import_batches_organization_id", "student_import_batches", ["organization_id"])
    op.create_index("ix_student_import_batches_expires_at", "student_import_batches", ["expires_at"])


def downgrade():
    op.drop_table("student_import_batches")
