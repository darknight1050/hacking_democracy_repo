-- Historical ballots remain NULL: do not invent telemetry for past votes.
ALTER TABLE ballot ADD COLUMN selection_context jsonb;
ALTER TABLE ballot ADD COLUMN submission_counts jsonb;
ALTER TABLE ballot ADD COLUMN counts_captured_at timestamptz;
ALTER TABLE vote ADD COLUMN count_at_selection integer CHECK (count_at_selection >= 0);
ALTER TABLE vote ADD COLUMN count_before_vote integer CHECK (count_before_vote >= 0);
ALTER TABLE vote ADD COLUMN district_id integer;
ALTER TABLE vote ADD COLUMN chosen_district boolean;
-- Newly issued ballots include a full selection snapshot. Old pending ones must refresh.
UPDATE ballot SET expires_at=LEAST(expires_at,now()) WHERE submitted_at IS NULL;
