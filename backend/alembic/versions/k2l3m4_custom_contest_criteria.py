"""custom_contest_criteria

Revision ID: k2l3m4_contest_criteria
Revises: j1k2l3_email_reminders
Create Date: 2026-07-30 18:00:00.000000

"""
from typing import Sequence, Union
from datetime import datetime, timezone
from alembic import op
import sqlalchemy as sa

revision: str = 'k2l3m4_contest_criteria'
down_revision: Union[str, Sequence[str], None] = 'j1k2l3_email_reminders'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SEED_DEFAULT_CRITERIA = [
    {"key": "looks", "label": "Looks", "emoji": "👀", "sort_order": 0},
    {"key": "style", "label": "Style", "emoji": "💅", "sort_order": 1},
    {"key": "kindness", "label": "Kindness", "emoji": "💛", "sort_order": 2},
    {"key": "intelligence", "label": "Intelligence", "emoji": "🧠", "sort_order": 3},
    {"key": "humor", "label": "Humor", "emoji": "😂", "sort_order": 4},
    {"key": "confidence", "label": "Confidence", "emoji": "😎", "sort_order": 5},
    {"key": "creativity", "label": "Creativity", "emoji": "🎨", "sort_order": 6},
    {"key": "friendliness", "label": "Friendliness", "emoji": "😊", "sort_order": 7},
    {"key": "talent", "label": "Talent", "emoji": "⭐", "sort_order": 8},
    {"key": "vibe", "label": "Vibe", "emoji": "✨", "sort_order": 9},
]


def upgrade() -> None:
    # 1. Create contest_criteria table
    op.create_table(
        'contest_criteria',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('contest_id', sa.Integer(), sa.ForeignKey('contests.id', ondelete='CASCADE'), nullable=False),
        sa.Column('key', sa.String(length=50), nullable=False),
        sa.Column('label', sa.String(length=30), nullable=False),
        sa.Column('emoji', sa.String(length=20), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('contest_id', 'key', name='uq_contest_criteria_contest_key')
    )

    # 2. Backfill contest_criteria for every existing contest
    connection = op.get_bind()
    contests = connection.execute(sa.text("SELECT id FROM contests")).fetchall()
    now_str = datetime.now(timezone.utc).isoformat()

    for (contest_id,) in contests:
        for item in SEED_DEFAULT_CRITERIA:
            connection.execute(
                sa.text("""
                    INSERT INTO contest_criteria (contest_id, key, label, emoji, sort_order, created_at)
                    VALUES (:contest_id, :key, :label, :emoji, :sort_order, :created_at)
                """),
                {
                    "contest_id": contest_id,
                    "key": item["key"],
                    "label": item["label"],
                    "emoji": item["emoji"],
                    "sort_order": item["sort_order"],
                    "created_at": now_str,
                }
            )

    # 3. Add criterion_id column to ratings, repoint, and swap columns
    with op.batch_alter_table('ratings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('criterion_id', sa.Integer(), nullable=True))

    # Repoint ratings.criterion_id to contest_criteria.id matching contestant's contest_id & criterion key
    connection.execute(sa.text("""
        UPDATE ratings
        SET criterion_id = (
            SELECT cc.id
            FROM contest_criteria cc
            JOIN contestants c ON c.contest_id = cc.contest_id
            WHERE c.id = ratings.contestant_id
              AND cc.key = ratings.criterion
        )
    """))

    with op.batch_alter_table('ratings', schema=None) as batch_op:
        batch_op.alter_column('criterion_id', existing_type=sa.Integer(), nullable=False)
        batch_op.create_foreign_key('fk_ratings_criterion_id', 'contest_criteria', ['criterion_id'], ['id'])
        batch_op.create_unique_constraint('uq_ratings_voter_contestant_criterion', ['voter_id', 'contestant_id', 'criterion_id'])
        batch_op.drop_column('criterion')


def downgrade() -> None:
    # Downgrade logic: add criterion string back to ratings, populate from contest_criteria.key, drop criterion_id, drop contest_criteria table
    with op.batch_alter_table('ratings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('criterion', sa.String(length=50), nullable=True))

    connection = op.get_bind()
    connection.execute(sa.text("""
        UPDATE ratings
        SET criterion = (
            SELECT cc.key
            FROM contest_criteria cc
            WHERE cc.id = ratings.criterion_id
        )
    """))

    with op.batch_alter_table('ratings', schema=None) as batch_op:
        batch_op.alter_column('criterion', existing_type=sa.String(length=50), nullable=False)
        batch_op.drop_constraint('uq_ratings_voter_contestant_criterion', type_='unique')
        batch_op.drop_constraint('fk_ratings_criterion_id', type_='foreignkey')
        batch_op.drop_column('criterion_id')
        batch_op.create_unique_constraint('uq_ratings_voter_contestant_criterion_old', ['voter_id', 'contestant_id', 'criterion'])

    op.drop_table('contest_criteria')
