-- Accounts reuse participant IDs so ballots and exposure history have one stable owner.
-- Existing anonymous participants are retained, never automatically claimed by an account.
CREATE TABLE user_account (
  id uuid PRIMARY KEY REFERENCES participant(id),
  username varchar(40) NOT NULL UNIQUE CHECK (username = lower(username)),
  password_hash text NOT NULL,
  district_ids integer[] NOT NULL DEFAULT '{}',
  category_ids integer[] NOT NULL DEFAULT '{}',
  preferences_configured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE user_session (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX user_session_expiry ON user_session(expires_at);
CREATE TABLE user_auth_limit (
  key text PRIMARY KEY,
  attempts integer NOT NULL,
  resets_at timestamptz NOT NULL
);
ALTER TABLE event ADD COLUMN auto_approve boolean NOT NULL DEFAULT false;
-- Preserve voting-time categories even when a moderator recategorizes an idea later.
ALTER TABLE vote ADD COLUMN category_ids integer[];
