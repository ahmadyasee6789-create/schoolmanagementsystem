"""add_academic_session_id_to_classrooms

Revision ID: 4b0e803c4461
Revises: 9e98ffa8f012
Create Date: 2026-03-30 18:12:50.929663

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b0e803c4461'
down_revision: Union[str, Sequence[str], None] = '9e98ffa8f012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Step 1: Add the column as nullable first (if table has existing data)
    op.add_column('classrooms', sa.Column('academic_session_id', sa.Integer(), nullable=True))
    
    # Step 2: If you have existing data, set a default value
    # First, check if academic_sessions table exists and has data
    connection = op.get_bind()
    
    # Check if academic_sessions table exists
    inspector = sa.inspect(connection)
    if 'academic_sessions' in inspector.get_table_names():
        # Check if there are any academic sessions
        result = connection.execute(sa.text("SELECT COUNT(*) FROM academic_sessions"))
        count = result.scalar()
        
        if count == 0:
            # Insert a default academic session if none exists
            op.execute("""
                INSERT INTO academic_sessions (name, start_date, end_date, is_active)
                VALUES ('2024-2025', '2024-01-01', '2024-12-31', true)
            """)
        
        # Update existing classrooms with the first academic session
        op.execute("""
            UPDATE classrooms 
            SET academic_session_id = (SELECT id FROM academic_sessions LIMIT 1)
            WHERE academic_session_id IS NULL
        """)
    else:
        # Create academic_sessions table first if it doesn't exist
        op.create_table('academic_sessions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('start_date', sa.Date(), nullable=False),
            sa.Column('end_date', sa.Date(), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_academic_sessions_id'), 'academic_sessions', ['id'], unique=False)
        
        # Insert default session
        op.execute("""
            INSERT INTO academic_sessions (name, start_date, end_date, is_active)
            VALUES ('2024-2025', '2024-01-01', '2024-12-31', true)
        """)
        
        # Update classrooms with the default session ID
        op.execute("""
            UPDATE classrooms 
            SET academic_session_id = (SELECT id FROM academic_sessions LIMIT 1)
        """)
    
    # Step 3: Make the column non-nullable
    op.alter_column('classrooms', 'academic_session_id', nullable=False)
    
    # Step 4: Create foreign key constraint
    op.create_foreign_key(
        'fk_classrooms_academic_session_id',
        'classrooms',
        'academic_sessions',
        ['academic_session_id'],
        ['id']
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop foreign key
    op.drop_constraint('fk_classrooms_academic_session_id', 'classrooms', type_='foreignkey')
    
    # Drop the column
    op.drop_column('classrooms', 'academic_session_id')
    
    # Optionally drop the academic_sessions table if you want
    # op.drop_table('academic_sessions')