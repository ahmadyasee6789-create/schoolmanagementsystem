"""update classroom table

Revision ID: 9e98ffa8f012
Revises: 02c0cf92f525
Create Date: 2026-03-30 18:08:33.930721

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9e98ffa8f012'
down_revision: Union[str, Sequence[str], None] = '02c0cf92f525'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Step 1: Add the column as nullable first (if table has existing data)
    op.add_column('classrooms', sa.Column('academic_year_id', sa.Integer(), nullable=True))
    
    # Step 2: If you have existing data, set a default value
    # First, check if academic_years table exists and has data
    connection = op.get_bind()
    
    # Check if academic_years table exists
    inspector = sa.inspect(connection)
    if 'academic_years' in inspector.get_table_names():
        # Check if there are any academic years
        result = connection.execute(sa.text("SELECT COUNT(*) FROM academic_years"))
        count = result.scalar()
        
        if count == 0:
            # Insert a default academic year if none exists
            op.execute("""
                INSERT INTO academic_years (name, start_date, end_date, is_active)
                VALUES ('2024-2025', '2024-01-01', '2024-12-31', true)
            """)
        
        # Update existing classrooms with the first academic year
        op.execute("""
            UPDATE classrooms 
            SET academic_year_id = (SELECT id FROM academic_years LIMIT 1)
            WHERE academic_year_id IS NULL
        """)
    else:
        # Create academic_years table first if it doesn't exist
        op.create_table('academic_years',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('start_date', sa.Date(), nullable=False),
            sa.Column('end_date', sa.Date(), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_academic_years_id'), 'academic_years', ['id'], unique=False)
        
        # Insert default year
        op.execute("""
            INSERT INTO academic_years (name, start_date, end_date, is_active)
            VALUES ('2024-2025', '2024-01-01', '2024-12-31', true)
        """)
        
        # Update classrooms with the default year ID
        op.execute("""
            UPDATE classrooms 
            SET academic_year_id = (SELECT id FROM academic_years LIMIT 1)
        """)
    
    # Step 3: Make the column non-nullable
    op.alter_column('classrooms', 'academic_year_id', nullable=False)
    
    # Step 4: Create foreign key constraint
    op.create_foreign_key(
        'fk_classrooms_academic_year_id',
        'classrooms',
        'academic_years',
        ['academic_year_id'],
        ['id']
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Drop foreign key
    op.drop_constraint('fk_classrooms_academic_year_id', 'classrooms', type_='foreignkey')
    
    # Drop the column
    op.drop_column('classrooms', 'academic_year_id')
    
    # Optionally drop the academic_years table if you want
    # op.drop_table('academic_years')