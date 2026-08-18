-- Funkin Online Server - D1 (SQLite) Schema
-- Migrated from Prisma/MongoDB

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  secret TEXT NOT NULL,
  joined INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  last_active INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  role TEXT,
  friend_requests TEXT NOT NULL DEFAULT '[]',  -- JSON array of user IDs
  friends TEXT NOT NULL DEFAULT '[]',           -- JSON array of user IDs
  email TEXT UNIQUE,
  bio TEXT,
  profile_hue INTEGER DEFAULT 250,
  profile_hue2 INTEGER,
  country TEXT,
  ips TEXT NOT NULL DEFAULT '[]',              -- JSON array of IP strings
  ng_url TEXT,
  ng_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- User stats (per key mode, lifetime and weekly)
CREATE TABLE IF NOT EXISTS user_stats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT,  -- NULL = lifetime, 'week' = weekly

  points_4k INTEGER DEFAULT 0,
  points_5k INTEGER DEFAULT 0,
  points_6k INTEGER DEFAULT 0,
  points_7k INTEGER DEFAULT 0,
  points_8k INTEGER DEFAULT 0,
  points_9k INTEGER DEFAULT 0,

  avg_acc_4k REAL DEFAULT 0,
  avg_acc_5k REAL DEFAULT 0,
  avg_acc_6k INTEGER DEFAULT 0,
  avg_acc_7k INTEGER DEFAULT 0,
  avg_acc_8k INTEGER DEFAULT 0,
  avg_acc_9k INTEGER DEFAULT 0,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_stats_user ON user_stats(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_stats_user_type ON user_stats(user_id, type);

-- Songs
CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  max_points REAL DEFAULT 0
);

-- Scores
CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  score REAL NOT NULL,
  accuracy REAL NOT NULL,
  points REAL NOT NULL,
  sicks REAL NOT NULL DEFAULT 0,
  goods REAL NOT NULL DEFAULT 0,
  bads REAL NOT NULL DEFAULT 0,
  shits REAL NOT NULL DEFAULT 0,
  misses REAL NOT NULL DEFAULT 0,
  playback_rate REAL DEFAULT 1,
  strum INTEGER NOT NULL DEFAULT 2,
  keys INTEGER,
  category TEXT,  -- NULL = lifetime, 'week' = weekly
  submitted INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  mod_url TEXT,
  song_id TEXT,
  player_id TEXT,
  replay_file_id TEXT UNIQUE,

  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE SET NULL,
  FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_song ON scores(song_id);
CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id);
CREATE INDEX IF NOT EXISTS idx_scores_song_strum_category_keys ON scores(song_id, strum, category, keys);

-- Reports
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  submitted INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  by TEXT NOT NULL
);

-- Song comments
CREATE TABLE IF NOT EXISTS song_comments (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  at REAL NOT NULL,
  by TEXT NOT NULL,
  song_id TEXT NOT NULL,
  submitted INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

  FOREIGN KEY (by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_song_comments_song ON song_comments(song_id);

-- Clubs
CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  tag TEXT UNIQUE NOT NULL,
  members TEXT NOT NULL DEFAULT '[]',   -- JSON array of user IDs
  pending TEXT NOT NULL DEFAULT '[]',   -- JSON array of user IDs
  leaders TEXT NOT NULL DEFAULT '[]',   -- JSON array of user IDs
  content TEXT,
  hue INTEGER,
  points INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  date INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  to_user TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  image TEXT,
  href TEXT,

  FOREIGN KEY (to_user) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_to ON notifications(to_user);

-- File storage (replays stored in R2, this is just metadata)
CREATE TABLE IF NOT EXISTS file_replays (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  date INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- User warnings
CREATE TABLE IF NOT EXISTS user_warnings (
  id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  date INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  on_user TEXT NOT NULL,
  by TEXT NOT NULL,

  FOREIGN KEY (on_user) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_warnings_on ON user_warnings(on_user);

-- Mods
CREATE TABLE IF NOT EXISTS mods (
  id TEXT PRIMARY KEY,
  images TEXT NOT NULL DEFAULT '[]',    -- JSON array of URLs
  keywords TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
  submitted INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  favorited TEXT NOT NULL DEFAULT '[]', -- JSON array of user IDs
  favorited_count INTEGER DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  download_hits INTEGER DEFAULT 0,
  updated INTEGER
);

CREATE INDEX IF NOT EXISTS idx_mods_title ON mods(title);

-- Mod downloads
CREATE TABLE IF NOT EXISTS mod_downloads (
  id TEXT PRIMARY KEY,
  urls TEXT NOT NULL DEFAULT '[]',  -- JSON array of URLs
  hits INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  mod_id TEXT NOT NULL,

  FOREIGN KEY (mod_id) REFERENCES mods(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mod_downloads_mod ON mod_downloads(mod_id);

-- Persistent data (stored as JSON blobs)
CREATE TABLE IF NOT EXISTS persistent_data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- File storage (avatars stored in R2)
CREATE TABLE IF NOT EXISTS file_avatars (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  owner TEXT NOT NULL,
  FOREIGN KEY (owner) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_file_avatars_owner ON file_avatars(owner);

-- File storage (backgrounds stored in R2)
CREATE TABLE IF NOT EXISTS file_backgrounds (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  owner TEXT NOT NULL,
  FOREIGN KEY (owner) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_file_backgrounds_owner ON file_backgrounds(owner);

-- File storage (club banners stored in R2)
CREATE TABLE IF NOT EXISTS file_banners (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  club_tag TEXT NOT NULL,
  FOREIGN KEY (club_tag) REFERENCES clubs(tag) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_file_banners_club ON file_banners(club_tag);

-- Initialize persistent data
INSERT OR IGNORE INTO persistent_data (key, value) VALUES
  ('front_messages', '[]'),
  ('logged_messages', '[]'),
  ('next_weekly_date', '0'),
  ('logged_mod_actions', '[]'),
  ('day_players', '[]'),
  ('country_players', '{}');
