CREATE TABLE IF NOT EXISTS event (
  id integer PRIMARY KEY CHECK (id = 1),
  title text NOT NULL DEFAULT 'A better city starts with us',
  phase text NOT NULL DEFAULT 'suggestions' CHECK (phase IN ('suggestions','voting','results')),
  method text NOT NULL DEFAULT 'ranked' CHECK (method IN ('ranked','approval','budget','elo')),
  subset_size integer NOT NULL DEFAULT 3 CHECK (subset_size BETWEEN 2 AND 8),
  vote_budget integer NOT NULL DEFAULT 10 CHECK (vote_budget BETWEEN 1 AND 100),
  winner_count integer NOT NULL DEFAULT 3 CHECK (winner_count BETWEEN 1 AND 100)
);
INSERT INTO event(id) VALUES (1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS district (id serial PRIMARY KEY, name text UNIQUE NOT NULL);
INSERT INTO district(name) SELECT 'District ' || n FROM generate_series(1,12) n ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS participant (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS suggestion (
  id uuid PRIMARY KEY, participant_id uuid NOT NULL REFERENCES participant(id),
  district_id integer NOT NULL REFERENCES district(id),
  title varchar(100) NOT NULL, description varchar(2000) NOT NULL,
  image bytea, image_type text CHECK (image_type = 'image/webp'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suggestion_participant ON suggestion(participant_id);
CREATE TABLE IF NOT EXISTS ballot (
  id uuid PRIMARY KEY, participant_id uuid NOT NULL REFERENCES participant(id),
  suggestion_ids uuid[] NOT NULL, method text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour'
);
CREATE INDEX IF NOT EXISTS ballot_participant ON ballot(participant_id);
CREATE TABLE IF NOT EXISTS vote (
  ballot_id uuid NOT NULL REFERENCES ballot(id), suggestion_id uuid NOT NULL REFERENCES suggestion(id),
  value double precision NOT NULL, PRIMARY KEY(ballot_id, suggestion_id)
);
CREATE TABLE IF NOT EXISTS score (
  suggestion_id uuid PRIMARY KEY REFERENCES suggestion(id),
  total double precision NOT NULL DEFAULT 0, appearances integer NOT NULL DEFAULT 0,
  rating double precision NOT NULL DEFAULT 1000
);
