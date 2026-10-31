"""Store a school's logo on its organization profile.

Revision ID: f8a29d10c6b4
Revises: e41b62a901df
"""
from alembic import op
import sqlalchemy as sa

revision = "f8a29d10c6b4"
down_revision = "e41b62a901df"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("organizations", sa.Column("logo", sa.LargeBinary(), nullable=True))


def downgrade():
    op.drop_column("organizations", "logo")
