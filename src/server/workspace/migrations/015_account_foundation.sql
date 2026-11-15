CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  model_version integer NOT NULL DEFAULT 0 CHECK (model_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_owner ON sessions(owner_id);
CREATE TABLE IF NOT EXISTS model_configs (
  owner_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  endpoint text NOT NULL,
  model text NOT NULL,
  credential jsonb NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{"text":"untested","image":"untested","tools":"untested"}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workspace_rate_limits (
  key_hash text PRIMARY KEY,
  starts_at timestamptz NOT NULL,
  hits integer NOT NULL
);
