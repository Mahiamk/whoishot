"""partner_opportunities

Revision ID: i0j1k2_partner_opportunities
Revises: h9i0j1_voditet_verification
Create Date: 2026-07-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'i0j1k2_partner_opportunities'
down_revision: Union[str, Sequence[str], None] = 'h9i0j1_voditet_verification'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('contestants', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('open_to_opportunities', sa.Boolean(), server_default=sa.text('false'), nullable=False)
        )

    op.create_table(
        'partner_inquiries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('company_name', sa.String(length=200), nullable=False),
        sa.Column('contact_name', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column(
            'inquiry_type',
            sa.Enum('modeling_school', 'fashion_show', 'stylist', 'other', name='inquirytype'),
            server_default='other',
            nullable=False,
        ),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('interested_in', sa.Text(), nullable=True),
        sa.Column(
            'status',
            sa.Enum('new', 'reviewing', 'matched', 'closed', name='inquirystatus'),
            server_default='new',
            nullable=False,
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'partner_introductions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('inquiry_id', sa.Integer(), nullable=False),
        sa.Column('contestant_id', sa.Integer(), nullable=False),
        sa.Column('admin_id', sa.Integer(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('pending_consent', 'accepted', 'declined', 'expired', name='introductionstatus'),
            server_default='pending_consent',
            nullable=False,
        ),
        sa.Column('admin_note', sa.Text(), nullable=True),
        sa.Column('contact_info_shared', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('shared_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deadline_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['admin_id'], ['users.id']),
        sa.ForeignKeyConstraint(['contestant_id'], ['contestants.id']),
        sa.ForeignKeyConstraint(['inquiry_id'], ['partner_inquiries.id']),
        sa.PrimaryKeyConstraint('id'),
    )



def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('partner_introductions')
    op.drop_table('partner_inquiries')
    with op.batch_alter_table('contestants', schema=None) as batch_op:
        batch_op.drop_column('open_to_opportunities')
