-- Better Auth 1.7.25 tables; independent from preserved legacy accounts/sessions.
CREATE TABLE identity_users (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
 "emailVerified" boolean NOT NULL DEFAULT false, image text,
 "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL
);
CREATE TABLE identity_sessions (
 id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
 "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL,
 "ipAddress" text, "userAgent" text,
 "userId" text NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE
);
CREATE INDEX identity_sessions_user ON identity_sessions("userId");
CREATE TABLE identity_accounts (
 id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
 "userId" text NOT NULL REFERENCES identity_users(id) ON DELETE CASCADE,
 "accessToken" text, "refreshToken" text, "idToken" text,
 "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz,
 scope text, password text, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL,
 UNIQUE("providerId", "accountId")
);
CREATE INDEX identity_accounts_user ON identity_accounts("userId");
CREATE TABLE identity_verifications (
 id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL,
 "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL
);
CREATE INDEX identity_verifications_identifier ON identity_verifications(identifier);
ALTER TABLE accounts ADD COLUMN identity_subject text UNIQUE;
ALTER TABLE accounts ADD COLUMN deletion_pending boolean NOT NULL DEFAULT false;
-- Independent durable tombstone survives local deletion and prevents subject resurrection.
CREATE TABLE account_deletions (
 owner_id uuid PRIMARY KEY, subject text NOT NULL UNIQUE, identity_user_id text NOT NULL,
 stage text NOT NULL DEFAULT 'verified' CHECK(stage IN ('verified','external_deleted','complete')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
