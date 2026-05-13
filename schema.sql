-- VolleyStats schema. Three tables: users, sessions, sets.
--
-- Sets get their own table instead of being a JSON blob on the session row,
-- so I can run real SQL against per-set data later - things like avg kills
-- per set by month, efficiency by set position, etc. Worth the join.

CREATE TABLE IF NOT EXISTS users (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_name TEXT    NOT NULL,
  event_date TEXT    NOT NULL,          -- YYYY-MM-DD (no timezone)
  notes      TEXT    DEFAULT '',
  mode       TEXT    NOT NULL,          -- 'offence' | 'offence_blocking' | 'full_game'
  created_at TEXT    NOT NULL           -- ISO datetime
);

CREATE TABLE IF NOT EXISTS sets (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  set_number      INTEGER NOT NULL,
  kills           INTEGER DEFAULT 0,
  errors          INTEGER DEFAULT 0,
  -- Attack outcome: play continues in our favour vs opponent's favour.
  continued_plus  INTEGER DEFAULT 0,
  continued_minus INTEGER DEFAULT 0,
  -- Blocking (offence_blocking + full_game).
  -- block_kills = stuff block (point scored); counts toward efficiency numerator.
  -- block_plus  = good redirect, play continues in our favour.
  -- block_minus = touched but opponent gets easy ball.
  -- block_errors = net/reach violation, point lost.
  block_kills     INTEGER DEFAULT 0,
  block_plus      INTEGER DEFAULT 0,
  block_minus     INTEGER DEFAULT 0,
  block_errors    INTEGER DEFAULT 0,
  -- Defence (full_game only).
  dig_plus        INTEGER DEFAULT 0,
  digs            INTEGER DEFAULT 0,
  dig_errors      INTEGER DEFAULT 0,
  -- Passing: graded 0–4 scale (full_game only). Summary stat = % of 4s.
  pass_4          INTEGER DEFAULT 0,
  pass_3          INTEGER DEFAULT 0,
  pass_2          INTEGER DEFAULT 0,
  pass_1          INTEGER DEFAULT 0,
  pass_0          INTEGER DEFAULT 0
);
