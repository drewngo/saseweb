-- Local member points database (SQLite).
-- wsu_id is a student identifier: keep this database out of site/ (which is public) and out of git.
CREATE TABLE IF NOT EXISTS members (
  name    TEXT    NOT NULL,
  wsu_id  TEXT    NOT NULL PRIMARY KEY,   -- text, so leading letters/zeros are kept
  points  INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  paid_member INTEGER NOT NULL DEFAULT 0 CHECK (paid_member IN (0, 1))  -- checkbox: 1 = paid dues
);
