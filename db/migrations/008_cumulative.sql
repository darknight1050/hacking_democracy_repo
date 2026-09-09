ALTER TABLE event DROP CONSTRAINT event_method_check;
ALTER TABLE event ADD CONSTRAINT event_method_check CHECK (method IN ('ranked','approval','budget','elo','cumulative'));
ALTER TABLE event ADD COLUMN funding_budget integer NOT NULL DEFAULT 1000000 CHECK (funding_budget BETWEEN 1 AND 1000000000);
-- Existing prototype proposals have placeholder estimates; review these before voting.
ALTER TABLE suggestion ADD COLUMN cost integer NOT NULL DEFAULT 10000 CHECK (cost BETWEEN 1 AND 1000000000);
ALTER TABLE ballot ADD COLUMN points_spent integer NOT NULL DEFAULT 0 CHECK (points_spent BETWEEN 0 AND 100);
ALTER TABLE vote ADD COLUMN points_spent integer CHECK (points_spent BETWEEN 0 AND 100);

-- Issuance is distinct from an observed browser view or a submitted response.
CREATE TABLE ballot_inclusion (
  ballot_id uuid NOT NULL REFERENCES ballot(id) ON DELETE CASCADE,
  suggestion_id uuid NOT NULL REFERENCES suggestion(id),
  PRIMARY KEY (ballot_id,suggestion_id)
);
CREATE INDEX ballot_inclusion_suggestion ON ballot_inclusion(suggestion_id);
INSERT INTO ballot_inclusion SELECT b.id,unnest(b.suggestion_ids) FROM ballot b ON CONFLICT DO NOTHING;
