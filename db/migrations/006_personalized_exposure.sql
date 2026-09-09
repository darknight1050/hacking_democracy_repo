ALTER TABLE event ADD COLUMN sampling jsonb NOT NULL DEFAULT '{"globalExponent":1,"districtBoost":3,"categoryBoost":2,"repeatExponent":1,"repeats":{"approval":false,"ranked":false,"budget":false,"elo":true}}';
ALTER TABLE ballot ADD COLUMN category_ids integer[] NOT NULL DEFAULT '{}';
CREATE TABLE ballot_exposure (
  ballot_id uuid NOT NULL REFERENCES ballot(id) ON DELETE CASCADE,
  suggestion_id uuid NOT NULL REFERENCES suggestion(id),
  viewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(ballot_id,suggestion_id)
);
CREATE INDEX exposure_suggestion ON ballot_exposure(suggestion_id);
CREATE INDEX ballot_participant_method ON ballot(participant_id,method);
-- Old ballots have no observed-view telemetry; never invent historical views.
UPDATE ballot SET expires_at=LEAST(expires_at,now()) WHERE submitted_at IS NULL;
