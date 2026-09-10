-- Fresh application schema. Apply once to an empty PostgreSQL database/schema.
-- Demo proposals are deliberately separate: scripts/seed-zurich.mjs.

CREATE TABLE event (
  id integer PRIMARY KEY CHECK (id = 1),
  title text NOT NULL DEFAULT 'A better city starts with us',
  phase text NOT NULL DEFAULT 'suggestions' CHECK (phase IN ('suggestions','voting','results')),
  method text NOT NULL DEFAULT 'ranked' CHECK (method IN ('ranked','approval','budget','elo','cumulative')),
  subset_size integer NOT NULL DEFAULT 3 CHECK (subset_size BETWEEN 2 AND 8),
  vote_budget integer NOT NULL DEFAULT 10 CHECK (vote_budget BETWEEN 1 AND 100),
  winner_count integer NOT NULL DEFAULT 3 CHECK (winner_count BETWEEN 1 AND 100),
  sampling jsonb NOT NULL DEFAULT '{"globalExponent":1,"districtBoost":3,"categoryBoost":2,"repeatExponent":1,"repeats":{"approval":false,"ranked":false,"budget":false,"elo":true}}',
  auto_approve boolean NOT NULL DEFAULT false,
  funding_budget integer NOT NULL DEFAULT 1000000 CHECK (funding_budget BETWEEN 1 AND 1000000000)
);
INSERT INTO event(id) VALUES (1);

CREATE TABLE district (
  id serial PRIMARY KEY,
  name text UNIQUE NOT NULL,
  is_citywide boolean NOT NULL DEFAULT false
);
INSERT INTO district(name) SELECT 'District ' || n FROM generate_series(1,12) n;
INSERT INTO district(name,is_citywide) VALUES ('City-wide',true);
CREATE UNIQUE INDEX one_citywide_district ON district(is_citywide) WHERE is_citywide;

CREATE TABLE category (id serial PRIMARY KEY, name text UNIQUE NOT NULL);
INSERT INTO category(name) VALUES ('Community'),('Environment'),('Transport'),('Food'),('Technology'),('Arts & culture'),('Health & safety'),('Education'),('Work & industry');
CREATE TABLE participant (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE suggestion (
  id uuid PRIMARY KEY,
  participant_id uuid NOT NULL REFERENCES participant(id),
  district_id integer NOT NULL REFERENCES district(id),
  title varchar(100) NOT NULL,
  description varchar(2000) NOT NULL,
  image bytea,
  image_type text CHECK (image_type = 'image/webp'),
  image_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','hidden','deleted')),
  moderation_note varchar(500) NOT NULL DEFAULT '',
  demo_key integer UNIQUE,
  cost integer NOT NULL DEFAULT 10000 CHECK (cost BETWEEN 1 AND 1000000000),
  location text CHECK (length(location) <= 300),
  latitude double precision CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT coordinate_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  -- Delivery is reported by administrators, never inferred from funding selection.
  delivery_status text NOT NULL DEFAULT 'not_reported' CHECK (delivery_status IN ('not_reported','planned','in_progress','completed','cancelled')),
  delivery_note text NOT NULL DEFAULT '' CHECK (length(delivery_note) <= 1000),
  delivery_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX suggestion_participant ON suggestion(participant_id);
CREATE INDEX suggestion_status ON suggestion(status,created_at DESC);
CREATE TABLE suggestion_category (
  suggestion_id uuid REFERENCES suggestion(id) ON DELETE CASCADE,
  category_id integer REFERENCES category(id),
  PRIMARY KEY(suggestion_id,category_id)
);
-- Deferred checks allow the proposal and its categories to be inserted in one transaction.
CREATE FUNCTION check_suggestion_category_count() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; n integer;
BEGIN
  IF TG_TABLE_NAME='suggestion' THEN target=NEW.id;
  ELSIF TG_OP='DELETE' THEN target=OLD.suggestion_id;
  ELSE target=NEW.suggestion_id;
  END IF;
  IF EXISTS(SELECT 1 FROM suggestion WHERE id=target) THEN
    SELECT count(*) INTO n FROM suggestion_category WHERE suggestion_id=target;
    IF n<1 OR n>3 THEN RAISE EXCEPTION 'A suggestion needs 1 to 3 categories' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER suggestion_needs_categories AFTER INSERT ON suggestion
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_suggestion_category_count();
CREATE CONSTRAINT TRIGGER valid_category_count AFTER INSERT OR UPDATE OR DELETE ON suggestion_category
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_suggestion_category_count();

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
CREATE TABLE user_auth_limit (key text PRIMARY KEY, attempts integer NOT NULL, resets_at timestamptz NOT NULL);
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

CREATE TABLE ballot (
  id uuid PRIMARY KEY, participant_id uuid NOT NULL REFERENCES participant(id),
  suggestion_ids uuid[] NOT NULL, method text NOT NULL,
  district_ids integer[] NOT NULL DEFAULT '{}', category_ids integer[] NOT NULL DEFAULT '{}',
  selection_context jsonb, submission_counts jsonb, counts_captured_at timestamptz,
  points_spent integer NOT NULL DEFAULT 0 CHECK (points_spent BETWEEN 0 AND 100),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour'
);
CREATE INDEX ballot_participant ON ballot(participant_id);
CREATE INDEX ballot_participant_method ON ballot(participant_id,method);
CREATE TABLE vote (
  ballot_id uuid NOT NULL REFERENCES ballot(id), suggestion_id uuid NOT NULL REFERENCES suggestion(id),
  value double precision NOT NULL,
  count_at_selection integer CHECK (count_at_selection >= 0),
  count_before_vote integer CHECK (count_before_vote >= 0),
  district_id integer, chosen_district boolean, category_ids integer[],
  points_spent integer CHECK (points_spent BETWEEN 0 AND 100),
  PRIMARY KEY(ballot_id,suggestion_id)
);
CREATE TABLE score (
  suggestion_id uuid PRIMARY KEY REFERENCES suggestion(id),
  total double precision NOT NULL DEFAULT 0, appearances integer NOT NULL DEFAULT 0,
  rating double precision NOT NULL DEFAULT 1000
);
-- Issuance, actual views and confirmed votes are separate telemetry events.
CREATE TABLE ballot_inclusion (
  ballot_id uuid NOT NULL REFERENCES ballot(id) ON DELETE CASCADE,
  suggestion_id uuid NOT NULL REFERENCES suggestion(id), PRIMARY KEY(ballot_id,suggestion_id)
);
CREATE INDEX ballot_inclusion_suggestion ON ballot_inclusion(suggestion_id);
CREATE TABLE ballot_exposure (
  ballot_id uuid NOT NULL REFERENCES ballot(id) ON DELETE CASCADE,
  suggestion_id uuid NOT NULL REFERENCES suggestion(id),
  viewed_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(ballot_id,suggestion_id)
);
CREATE INDEX exposure_suggestion ON ballot_exposure(suggestion_id);
CREATE TABLE catalog_view (
  participant_id uuid NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
  suggestion_id uuid NOT NULL REFERENCES suggestion(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(participant_id,suggestion_id)
);
CREATE TABLE cumulative_cart (
  participant_id uuid PRIMARY KEY REFERENCES participant(id),
  allocations jsonb NOT NULL DEFAULT '{}', origins jsonb NOT NULL DEFAULT '{}',
  confirmed jsonb NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 0, checkout_revision integer NOT NULL DEFAULT -1
);
CREATE TABLE cumulative_cart_change (
  participant_id uuid NOT NULL REFERENCES cumulative_cart(participant_id) ON DELETE CASCADE,
  revision integer NOT NULL, suggestion_id uuid NOT NULL REFERENCES suggestion(id) ON DELETE CASCADE,
  previous_coins integer NOT NULL, coins integer NOT NULL,
  source text NOT NULL CHECK (source IN ('random','catalog','checkout')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(participant_id,revision)
);
CREATE FUNCTION clear_cumulative_carts_after_reset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ballot) THEN
    DELETE FROM cumulative_cart;
    DELETE FROM catalog_view;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER reset_cumulative_carts AFTER DELETE ON ballot
  FOR EACH STATEMENT EXECUTE FUNCTION clear_cumulative_carts_after_reset();
CREATE TABLE hidden_achievement (
  participant_id uuid NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
  achievement text NOT NULL CHECK (achievement='never-gonna-give-you-up'),
  earned_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(participant_id,achievement)
);

-- One occurrence per account and tag; totals are published only in results.
CREATE TABLE suggestion_feedback (
  suggestion_id uuid NOT NULL REFERENCES suggestion(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  tag text NOT NULL CHECK (tag IN ('excessive budget','location issues','redundant','narrow impact','Fills a gap','Urgently needed','great idea','Broad impact')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(suggestion_id,account_id)
);
