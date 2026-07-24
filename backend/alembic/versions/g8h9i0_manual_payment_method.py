"""manual_payment_method

Revision ID: g8h9i0_manual_payment_method
Revises: fa3a2993d80b
Create Date: 2026-07-24 18:58:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g8h9i0_manual_payment_method'
down_revision: Union[str, Sequence[str], None] = 'fa3a2993d80b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name == 'postgresql':
        for val in ['awaiting_review', 'rejected']:
            bind.execute(sa.text(f"ALTER TYPE subscriptionstatus ADD VALUE IF NOT EXISTS '{val}'"))
            bind.execute(sa.text(f"ALTER TYPE entrypaymentstatus ADD VALUE IF NOT EXISTS '{val}'"))

    with op.batch_alter_table('subscriptions', schema=None) as batch_op:

        batch_op.add_column(sa.Column('method', sa.String(length=20), nullable=False, server_default='provider'))
        batch_op.add_column(sa.Column('receipt_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('receipt_hash', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('reviewed_by', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('review_note', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True))

    with op.batch_alter_table('entries_payments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('method', sa.String(length=20), nullable=False, server_default='provider'))
        batch_op.add_column(sa.Column('receipt_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('receipt_hash', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('reviewed_by', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('review_note', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('entries_payments', schema=None) as batch_op:
        batch_op.drop_column('reviewed_at')
        batch_op.drop_column('review_note')
        batch_op.drop_column('reviewed_by')
        batch_op.drop_column('receipt_hash')
        batch_op.drop_column('receipt_url')
        batch_op.drop_column('method')

    with op.batch_alter_table('subscriptions', schema=None) as batch_op:
        batch_op.drop_column('reviewed_at')
        batch_op.drop_column('review_note')
        batch_op.drop_column('reviewed_by')
        batch_op.drop_column('receipt_hash')
        batch_op.drop_column('receipt_url')
        batch_op.drop_column('method')
