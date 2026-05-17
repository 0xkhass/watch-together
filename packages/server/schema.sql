-- Watch Together Database Schema
-- Run this against your Supabase/PostgreSQL instance

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(8) UNIQUE NOT NULL,
  name        VARCHAR(100),
  host_id     VARCHAR(64) NOT NULL,
  video_url   TEXT,
  video_name  VARCHAR(255),
  video_type  VARCHAR(20) DEFAULT 'url', -- 'url' | 'local'
  current_time FLOAT DEFAULT 0,
  is_playing  BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Index for fast room lookup by code
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_expires ON rooms(expires_at);

-- Chat messages table
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id     VARCHAR(64) NOT NULL,
  username    VARCHAR(50) NOT NULL,
  avatar_color VARCHAR(20) NOT NULL,
  content     TEXT NOT NULL,
  type        VARCHAR(20) DEFAULT 'text', -- 'text' | 'system' | 'reaction'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at DESC);

-- Room members (optional persistence, mainly in-memory)
CREATE TABLE IF NOT EXISTS room_members (
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id     VARCHAR(64) NOT NULL,
  username    VARCHAR(50) NOT NULL,
  avatar_color VARCHAR(20) NOT NULL,
  is_host     BOOLEAN DEFAULT false,
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

-- Auto-cleanup expired rooms (run as cron or Supabase Edge Function)
-- DELETE FROM rooms WHERE expires_at < NOW();

-- Row Level Security (Supabase)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated and anonymous users via service role
-- (The server uses the service role key, so these are bypassed server-side)
CREATE POLICY "rooms_all" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "messages_all" ON messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "members_all" ON room_members FOR ALL USING (true) WITH CHECK (true);