CREATE TABLE knowledge_sources (
  id text PRIMARY KEY, current_version integer NOT NULL CHECK(current_version > 0),
  active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE knowledge_versions (
  source_id text NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK(version > 0), metadata jsonb NOT NULL,
  PRIMARY KEY(source_id,version)
);
CREATE TABLE knowledge_chunks (
  source_id text NOT NULL, version integer NOT NULL, id text NOT NULL, data jsonb NOT NULL,
  PRIMARY KEY(source_id,version,id),
  FOREIGN KEY(source_id,version) REFERENCES knowledge_versions(source_id,version) ON DELETE CASCADE
);
CREATE INDEX knowledge_chunks_conditions ON knowledge_chunks USING gin ((data->'conditions'));
