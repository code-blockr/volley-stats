-- Local-dev seed data. Run with:
--   wrangler d1 execute volleystats-db --local --file=seed.sql
--
-- Don't ever run this with --remote. Prod starts empty.

INSERT OR IGNORE INTO users (id, name) VALUES (1, 'Mance Rah');

-- Session 1 - Tuesday League vs. Rebels - offence - 3 sets
INSERT INTO sessions (id, user_id, event_name, event_date, notes, mode, created_at)
VALUES (1, 1, 'Tuesday League vs. Rebels', '2026-03-04', 'Good energy, gym was loud. Focused on angle shots.', 'offence', '2026-03-04T12:00:00Z');
INSERT INTO sets (session_id, set_number, kills, errors, continued) VALUES (1, 1, 9, 2, 14);
INSERT INTO sets (session_id, set_number, kills, errors, continued) VALUES (1, 2, 7, 3, 11);
INSERT INTO sets (session_id, set_number, kills, errors, continued) VALUES (1, 3, 11, 2, 13);

-- Session 2 - Friday Scrimmage vs. Hammers - offence_blocking - 2 sets
INSERT INTO sessions (id, user_id, event_name, event_date, notes, mode, created_at)
VALUES (2, 1, 'Friday Scrimmage vs. Hammers', '2026-03-11', '', 'offence_blocking', '2026-03-11T12:00:00Z');
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors) VALUES (2, 1, 8, 3, 12, 1, 2, 1);
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors) VALUES (2, 2, 6, 2, 10, 0, 1, 0);

-- Session 3 - Saturday Invitational - full_game - 3 sets
INSERT INTO sessions (id, user_id, event_name, event_date, notes, mode, created_at)
VALUES (3, 1, 'Saturday Invitational', '2026-03-18', '', 'full_game', '2026-03-18T12:00:00Z');
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors, dig_perfect, digs, dig_errors, pass_perfect, pass_positive, pass_error)
VALUES (3, 1, 10, 2, 13, 1, 3, 1, 2, 8, 1, 5, 3, 1);
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors, dig_perfect, digs, dig_errors, pass_perfect, pass_positive, pass_error)
VALUES (3, 2, 7, 4, 11, 0, 1, 0, 1, 7, 2, 4, 4, 0);
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors, dig_perfect, digs, dig_errors, pass_perfect, pass_positive, pass_error)
VALUES (3, 3, 12, 2, 10, 1, 2, 1, 2, 9, 1, 6, 2, 1);

-- Session 4 - Tuesday League vs. Spikes - offence - 2 sets
INSERT INTO sessions (id, user_id, event_name, event_date, notes, mode, created_at)
VALUES (4, 1, 'Tuesday League vs. Spikes', '2026-03-25', '', 'offence', '2026-03-25T12:00:00Z');
INSERT INTO sets (session_id, set_number, kills, errors, continued) VALUES (4, 1, 6, 4, 13);
INSERT INTO sets (session_id, set_number, kills, errors, continued) VALUES (4, 2, 8, 2, 12);

-- Session 5 - Club Practice Match - offence_blocking - 3 sets
INSERT INTO sessions (id, user_id, event_name, event_date, notes, mode, created_at)
VALUES (5, 1, 'Club Practice Match', '2026-04-01', '', 'offence_blocking', '2026-04-01T12:00:00Z');
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors) VALUES (5, 1, 9, 3, 11, 1, 2, 0);
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors) VALUES (5, 2, 7, 2, 14, 1, 3, 1);
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors) VALUES (5, 3, 10, 3, 12, 0, 1, 1);

-- Session 6 - Regional Qualifier - full_game - 2 sets
INSERT INTO sessions (id, user_id, event_name, event_date, notes, mode, created_at)
VALUES (6, 1, 'Regional Qualifier', '2026-04-08', 'Big match. Nerves were real in set 1 but settled down.', 'full_game', '2026-04-08T12:00:00Z');
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors, dig_perfect, digs, dig_errors, pass_perfect, pass_positive, pass_error)
VALUES (6, 1, 7, 4, 14, 0, 1, 1, 1, 9, 2, 4, 5, 2);
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors, dig_perfect, digs, dig_errors, pass_perfect, pass_positive, pass_error)
VALUES (6, 2, 11, 2, 12, 1, 3, 0, 2, 11, 1, 7, 3, 0);

-- Session 7 - Tuesday League vs. Storm - offence - 3 sets
INSERT INTO sessions (id, user_id, event_name, event_date, notes, mode, created_at)
VALUES (7, 1, 'Tuesday League vs. Storm', '2026-04-15', '', 'offence', '2026-04-15T12:00:00Z');
INSERT INTO sets (session_id, set_number, kills, errors, continued) VALUES (7, 1, 13, 2, 11);
INSERT INTO sets (session_id, set_number, kills, errors, continued) VALUES (7, 2, 9, 3, 13);
INSERT INTO sets (session_id, set_number, kills, errors, continued) VALUES (7, 3, 8, 1, 15);

-- Session 8 - Friday Scrimmage vs. Aces - offence_blocking - 2 sets
INSERT INTO sessions (id, user_id, event_name, event_date, notes, mode, created_at)
VALUES (8, 1, 'Friday Scrimmage vs. Aces', '2026-04-22', '', 'offence_blocking', '2026-04-22T12:00:00Z');
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors) VALUES (8, 1, 10, 2, 12, 1, 2, 1);
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors) VALUES (8, 2, 8, 3, 11, 1, 3, 0);

-- Session 9 - Spring Championship - full_game - 3 sets
INSERT INTO sessions (id, user_id, event_name, event_date, notes, mode, created_at)
VALUES (9, 1, 'Spring Championship', '2026-04-29', 'Biggest match of the season. Ended on a high.', 'full_game', '2026-04-29T12:00:00Z');
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors, dig_perfect, digs, dig_errors, pass_perfect, pass_positive, pass_error)
VALUES (9, 1, 11, 3, 12, 1, 2, 1, 2, 10, 1, 6, 4, 1);
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors, dig_perfect, digs, dig_errors, pass_perfect, pass_positive, pass_error)
VALUES (9, 2, 9, 2, 14, 1, 3, 0, 1, 8, 2, 5, 3, 0);
INSERT INTO sets (session_id, set_number, kills, errors, continued, block_kills, block_positive, block_errors, dig_perfect, digs, dig_errors, pass_perfect, pass_positive, pass_error)
VALUES (9, 3, 14, 2, 11, 1, 2, 1, 2, 12, 1, 8, 2, 1);
