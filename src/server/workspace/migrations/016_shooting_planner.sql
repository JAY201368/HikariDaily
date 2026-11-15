CREATE TABLE IF NOT EXISTS planner_notebooks (
  owner_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0,
  operation_id uuid,
  document jsonb NOT NULL DEFAULT '{"version":1,"plans":[],"trash":[]}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS planner_images (
  owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  id text NOT NULL,
  mime_type text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,id)
);
