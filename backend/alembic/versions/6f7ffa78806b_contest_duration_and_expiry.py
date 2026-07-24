"""contest duration and expiry

Revision ID: 6f7ffa78806b
Revises: 2bc1dcc00e4c
Create Date: 2026-07-13 17:17:35.930701

"""
from datetime import datetime, timedelta, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import column, table


# revision identifiers, used by Alembic.
revision: str = '6f7ffa78806b'
down_revision: Union[str, Sequence[str], None] = '2bc1dcc00e4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('admin_audit_log', schema=None) as batch_op:
        batch_op.alter_column('admin_id',
               existing_type=sa.INTEGER(),
               nullable=True)

    # ends_at is NOT NULL but existing contests have none — add nullable,
    # backfill a sane default (now + 14 days), then tighten the constraint.
    op.add_column('contests', sa.Column('ends_at', sa.DateTime(timezone=True), nullable=True))
    contests_table = table('contests', column('id', sa.Integer), column('ends_at', sa.DateTime(timezone=True)))
    backfill_ends_at = datetime.now(timezone.utc) + timedelta(days=14)
    op.execute(contests_table.update().values(ends_at=backfill_ends_at))
    with op.batch_alter_table('contests', schema=None) as batch_op:
        batch_op.alter_column('ends_at', existing_type=sa.DateTime(timezone=True), nullable=False)

    # op.add_column() does not create the associated Postgres ENUM type on
    # its own (unlike op.create_table) — create it explicitly first. No-op
    # on SQLite, which has no native enum type.
    contest_status_enum = sa.Enum('active', 'ended', name='conteststatus')
    contest_status_enum.create(op.get_bind(), checkfirst=True)
    with op.batch_alter_table('contests', schema=None) as batch_op:
        batch_op.add_column(sa.Column('status', contest_status_enum, server_default='active', nullable=False))
        batch_op.add_column(sa.Column('extended_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('contests', schema=None) as batch_op:
        batch_op.drop_column('extended_at')
        batch_op.drop_column('status')
        batch_op.drop_column('ends_at')
    sa.Enum(name='conteststatus').drop(op.get_bind(), checkfirst=True)

    with op.batch_alter_table('admin_audit_log', schema=None) as batch_op:
        batch_op.alter_column('admin_id',
               existing_type=sa.INTEGER(),
               nullable=False)
