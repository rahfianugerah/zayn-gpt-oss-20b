"""search conversations by title and message text

Adds the normalization and phonetic fold from docs/component/search.component.md, copied without
change so this project's search keys match every other project's, then stored search columns and
the indexes each stage of the search ladder uses. The downgrade leaves the two extensions installed,
since dropping them would break anything else in the database that uses them.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-27 15:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, Sequence[str], None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

IMM_UNACCENT = """
CREATE FUNCTION imm_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent', $1) $$
"""

NORM = """
CREATE FUNCTION norm(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT btrim(regexp_replace(lower(imm_unaccent(coalesce(t, ''))), '[^a-z0-9]+', ' ', 'g')) $$
"""

FON = r"""
CREATE FUNCTION fon(t text) RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE s text := norm(t);
BEGIN
  s := replace(s, 'oe', 'u');
  s := replace(s, 'sch', 'sk');
  s := replace(s, 'sc', 'sk');
  s := replace(s, 'dj', 'j');
  s := replace(s, 'tj', 'c');
  s := replace(s, 'nj', 'ny');
  s := replace(s, 'sj', 'sy');
  s := replace(s, 'ph', 'f');
  s := replace(s, 'v', 'f');
  s := replace(s, 'th', 't');
  s := replace(s, 'ch', 'k');
  s := replace(s, 'kh', 'k');
  s := replace(s, 'x', 'ks');
  s := replace(s, 'q', 'k');
  s := replace(s, 'z', 's');
  s := regexp_replace(s, '(?<![ns])y', 'i', 'g');
  s := regexp_replace(s, '(.)\1', '\1', 'g');
  RETURN s;
END $$
"""


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute(IMM_UNACCENT)
    op.execute(NORM)
    op.execute(FON)

    # Stored, so the fold is computed once on write and never per row while searching
    op.add_column(
        "conversations",
        sa.Column("search_norm", sa.Text(), sa.Computed("norm(title)", persisted=True)),
    )
    op.add_column(
        "conversations",
        sa.Column("search_fon", sa.Text(), sa.Computed("fon(title)", persisted=True)),
    )
    # Message text is only ever matched by the fuzzy stage, so it needs the phonetic key alone
    op.add_column(
        "messages",
        sa.Column("search_fon", sa.Text(), sa.Computed("fon(content)", persisted=True)),
    )

    op.create_index("conversations_search_norm_idx", "conversations", ["search_norm"])
    op.execute("CREATE INDEX conversations_search_pre_idx ON conversations (search_norm text_pattern_ops)")
    op.execute("CREATE INDEX conversations_search_fon_idx ON conversations USING gin (search_fon gin_trgm_ops)")
    op.execute("CREATE INDEX messages_search_fon_idx ON messages USING gin (search_fon gin_trgm_ops)")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("messages_search_fon_idx", table_name="messages")
    op.drop_index("conversations_search_fon_idx", table_name="conversations")
    op.drop_index("conversations_search_pre_idx", table_name="conversations")
    op.drop_index("conversations_search_norm_idx", table_name="conversations")
    op.drop_column("messages", "search_fon")
    op.drop_column("conversations", "search_fon")
    op.drop_column("conversations", "search_norm")
    op.execute("DROP FUNCTION fon(text)")
    op.execute("DROP FUNCTION norm(text)")
    op.execute("DROP FUNCTION imm_unaccent(text)")
