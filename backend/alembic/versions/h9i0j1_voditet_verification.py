"""voditet_verification

Revision ID: h9i0j1_voditet_verification
Revises: g8h9i0_manual_payment_method
Create Date: 2026-07-24 20:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h9i0j1_voditet_verification'
down_revision: Union[str, Sequence[str], None] = 'g8h9i0_manual_payment_method'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('subscriptions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('receipt_input_type', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('receipt_url_submitted', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('receipt_image_path', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('verify_provider_key', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('verify_source', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('verify_raw_response', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('verify_reference', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('verify_amount', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('verify_currency', sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column('verify_payer_name', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('verify_status', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('voditet_request_id', sa.String(length=255), nullable=True))

    with op.batch_alter_table('entries_payments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('receipt_input_type', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('receipt_url_submitted', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('receipt_image_path', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('verify_provider_key', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('verify_source', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('verify_raw_response', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('verify_reference', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('verify_amount', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('verify_currency', sa.String(length=10), nullable=True))
        batch_op.add_column(sa.Column('verify_payer_name', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('verify_status', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('voditet_request_id', sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('entries_payments', schema=None) as batch_op:
        batch_op.drop_column('voditet_request_id')
        batch_op.drop_column('verified_at')
        batch_op.drop_column('verify_status')
        batch_op.drop_column('verify_payer_name')
        batch_op.drop_column('verify_currency')
        batch_op.drop_column('verify_amount')
        batch_op.drop_column('verify_reference')
        batch_op.drop_column('verify_raw_response')
        batch_op.drop_column('verify_source')
        batch_op.drop_column('verify_provider_key')
        batch_op.drop_column('receipt_image_path')
        batch_op.drop_column('receipt_url_submitted')
        batch_op.drop_column('receipt_input_type')

    with op.batch_alter_table('subscriptions', schema=None) as batch_op:
        batch_op.drop_column('voditet_request_id')
        batch_op.drop_column('verified_at')
        batch_op.drop_column('verify_status')
        batch_op.drop_column('verify_payer_name')
        batch_op.drop_column('verify_currency')
        batch_op.drop_column('verify_amount')
        batch_op.drop_column('verify_reference')
        batch_op.drop_column('verify_raw_response')
        batch_op.drop_column('verify_source')
        batch_op.drop_column('verify_provider_key')
        batch_op.drop_column('receipt_image_path')
        batch_op.drop_column('receipt_url_submitted')
        batch_op.drop_column('receipt_input_type')
