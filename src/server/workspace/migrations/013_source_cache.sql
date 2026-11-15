CREATE TABLE source_cache_entries (
  cache_key text PRIMARY KEY CHECK (length(cache_key) <= 160),
  record jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX source_cache_entries_expiry_idx ON source_cache_entries (expires_at);
