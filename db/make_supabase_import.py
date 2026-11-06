#!/usr/bin/env python3
"""Build a one-time SQL import of db/sase.db for the Supabase SQL Editor.

Writes db/supabase_import.sql (git-ignored: it holds WSU IDs). Paste it into
Supabase -> SQL Editor -> New query -> Run, after supabase/schema.sql has been run.

- Each member becomes a row in public.members (public: name only).
- WSU ID and paid status go to public.member_private (officers only).
- Each member's current total becomes one point entry, "Imported from SQLite tally".
The script refuses to run twice: it stops if any of these WSU IDs are already in Supabase.
"""
import sqlite3
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "db" / "supabase_import.sql"

def q(s):
    return "'" + str(s).replace("'", "''") + "'"

with sqlite3.connect(ROOT / "db" / "sase.db") as conn:
    rows = conn.execute("SELECT name, wsu_id, points, paid_member FROM members ORDER BY name").fetchall()

data = [(str(uuid.uuid4()), name.strip(), wsu.strip(), pts, bool(paid)) for name, wsu, pts, paid in rows]
ids = ", ".join(q(w.lower()) for _, _, w, _, _ in data)

sql = [
    "-- One-time import from db/sase.db. Contains student IDs: do not commit or share.",
    "begin;",
    "do $$ begin",
    f"  if exists (select 1 from public.member_private where lower(wsu_id) in ({ids})) then",
    "    raise exception 'Some of these members are already in Supabase; nothing was imported.';",
    "  end if;",
    "end $$;",
    "",
    "insert into public.members (id, name) values",
    ",\n".join(f"  ({q(i)}, {q(n)})" for i, n, _, _, _ in data) + ";",
    "",
    "insert into public.member_private (member_id, wsu_id, paid_member) values",
    ",\n".join(f"  ({q(i)}, {q(w)}, {str(p).lower()})" for i, _, w, _, p in data) + ";",
    "",
    "insert into public.point_entries (member_id, points, reason) values",
    ",\n".join(f"  ({q(i)}, {pts}, 'Imported from SQLite tally')" for i, _, _, pts, _ in data if pts) + ";",
    "",
    "commit;",
    f"-- {len(data)} members, {sum(d[3] for d in data)} points, {sum(d[4] for d in data)} paid.",
]
OUT.write_text("\n".join(sql) + "\n")
print(f"wrote {OUT.relative_to(ROOT)}: {len(data)} members, {sum(d[3] for d in data)} points, {sum(d[4] for d in data)} paid")
