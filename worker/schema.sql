-- リハコイン D1 スキーマ

-- ユーザー
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nickname TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  friend_code TEXT UNIQUE NOT NULL,
  feed_visibility TEXT NOT NULL DEFAULT 'activity_name',
  recovery_hash TEXT,
  created_at INTEGER NOT NULL
);

-- Login attempt tracking (brute force protection)
CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(identifier, attempted_at);

-- 記録
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  activity_id TEXT,
  category_code TEXT NOT NULL,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  memo TEXT DEFAULT '',
  is_free_input INTEGER DEFAULT 0,
  witnessed INTEGER DEFAULT 0,
  witnessed_by TEXT,
  witnessed_at INTEGER,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_records_user ON records(user_id);
CREATE INDEX IF NOT EXISTS idx_records_timestamp ON records(user_id, timestamp);

-- ご褒美
CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  cost INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- コイン使用記録
CREATE TABLE IF NOT EXISTS coin_spending (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reward_label TEXT,
  spent_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- フレンド関係（双方向）
CREATE TABLE IF NOT EXISTS friends (
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (friend_id) REFERENCES users(id)
);

-- フレンド申請
CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (to_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user_id, status);

-- 応援（Cheer）
CREATE TABLE IF NOT EXISTS cheers (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (record_id) REFERENCES records(id)
);
CREATE INDEX IF NOT EXISTS idx_cheers_record ON cheers(record_id);
CREATE INDEX IF NOT EXISTS idx_cheers_user ON cheers(from_user_id);
