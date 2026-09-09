ALTER TABLE suggestion ADD COLUMN status text NOT NULL DEFAULT 'approved'
  CHECK (status IN ('pending', 'approved', 'hidden', 'deleted'));
ALTER TABLE suggestion ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE suggestion ADD COLUMN moderation_note varchar(500) NOT NULL DEFAULT '';
ALTER TABLE suggestion ADD COLUMN image_url text;
ALTER TABLE suggestion ADD COLUMN image_credit text;
ALTER TABLE suggestion ADD COLUMN image_source text;
ALTER TABLE suggestion ADD COLUMN demo_key integer UNIQUE;
CREATE INDEX suggestion_status ON suggestion(status, created_at DESC);

CREATE TABLE admin_user (
  id uuid PRIMARY KEY, username text UNIQUE NOT NULL,
  password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE admin_session (
  token_hash text PRIMARY KEY, admin_id uuid NOT NULL REFERENCES admin_user(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE admin_login_limit (
  id integer PRIMARY KEY CHECK(id=1), attempts integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);
INSERT INTO admin_login_limit(id) VALUES(1);
CREATE TABLE admin_audit (
  id bigserial PRIMARY KEY, admin_id uuid REFERENCES admin_user(id),
  action text NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
