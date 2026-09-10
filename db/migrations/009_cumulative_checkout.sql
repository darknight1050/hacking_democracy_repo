-- Keep historical ballots for telemetry while only the latest allocation counts.
ALTER TABLE ballot ADD COLUMN superseded_at timestamptz;
CREATE TABLE cumulative_cart (
  participant_id uuid PRIMARY KEY REFERENCES participant(id),
  allocations jsonb NOT NULL DEFAULT '{}',
  origins jsonb NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 0,
  checkout_revision integer NOT NULL DEFAULT -1
);
CREATE TABLE cumulative_cart_change (
  participant_id uuid NOT NULL REFERENCES cumulative_cart(participant_id) ON DELETE CASCADE,
  revision integer NOT NULL,
  suggestion_id uuid NOT NULL REFERENCES suggestion(id) ON DELETE CASCADE,
  previous_coins integer NOT NULL,
  coins integer NOT NULL,
  source text NOT NULL CHECK (source IN ('random','catalog','checkout')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(participant_id,revision)
);
-- Existing dev-reset and fixture scripts already delete every ballot. Reset carts with them.
CREATE FUNCTION clear_cumulative_carts_after_reset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ballot) THEN DELETE FROM cumulative_cart; END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER reset_cumulative_carts AFTER DELETE ON ballot
  FOR EACH STATEMENT EXECUTE FUNCTION clear_cumulative_carts_after_reset();
