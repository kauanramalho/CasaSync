"""Repair the family member alias column on already-versioned databases.

Revision ID: 20261007_0002
Revises: 20260801_0001

The baseline already declares this optional column for fresh installations.
Changing that baseline does not upgrade databases that have already applied it.
"""

from alembic import context, op
import sqlalchemy as sa


revision = "20261007_0002"
down_revision = "20260801_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if context.is_offline_mode():
        if context.get_context().dialect.name != "postgresql":
            raise RuntimeError("Esta migracao requer conexao online fora do PostgreSQL.")
        op.execute("ALTER TABLE family_members ADD COLUMN IF NOT EXISTS ai_aliases JSON")
        return

    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("family_members")}
    if "ai_aliases" not in columns:
        op.add_column("family_members", sa.Column("ai_aliases", sa.JSON(), nullable=True))


def downgrade() -> None:
    # Retain the column and any aliases: the baseline also declares it, and
    # older application code tolerates this additive column. Never erase data
    # merely to roll back the revision marker.
    pass
