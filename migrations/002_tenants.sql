-- Migration 002: Add Tenants and related tables

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT,
  brand_voice TEXT,
  persona_prompt TEXT,
  disclaimer TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_binds (
  user_id TEXT,
  channel TEXT,
  channel_user_id TEXT,
  linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel, channel_user_id)
);

CREATE TABLE IF NOT EXISTS tenant_knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT,
  topic TEXT,
  question_pattern TEXT,
  answer TEXT,
  guide_card TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT,
  user_id TEXT,
  channel TEXT,
  profession TEXT,
  achievements TEXT,
  contact TEXT,
  score INTEGER,
  report TEXT,
  status TEXT DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS legal_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT,
  topic TEXT,
  fact TEXT,
  source_url TEXT,
  source_date TEXT,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
