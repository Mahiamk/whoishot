"""transactional_email_and_reminders

Revision ID: j1k2l3_email_reminders
Revises: i0j1k2_partner_opportunities
Create Date: 2026-07-25 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'j1k2l3_email_reminders'
down_revision: Union[str, Sequence[str], None] = 'i0j1k2_partner_opportunities'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('email_opt_out', sa.Boolean(), server_default=sa.text('false'), nullable=False)
        )

    with op.batch_alter_table('contests', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('reminder_24h_sent_at', sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(
            sa.Column('reminder_1h_sent_at', sa.DateTime(timezone=True), nullable=True)
        )

    op.create_table(
        'email_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('to_email', sa.String(length=255), nullable=False),
        sa.Column('template_key', sa.String(length=100), nullable=False),
        sa.Column('context', sa.JSON(), nullable=True),
        sa.Column('resend_id', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='sent'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('email_logs')
    with op.batch_alter_table('contests', schema=None) as batch_op:
        batch_op.drop_column('reminder_1h_sent_at')
        batch_op.drop_column('reminder_24h_sent_at')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('email_opt_out')
