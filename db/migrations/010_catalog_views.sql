-- Actual catalog views supplement ballot exposures; loading a page is not a view.
CREATE TABLE catalog_view (
  participant_id uuid NOT NULL REFERENCES participant(id) ON DELETE CASCADE,
  suggestion_id uuid NOT NULL REFERENCES suggestion(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (participant_id, suggestion_id)
);

CREATE OR REPLACE FUNCTION clear_cumulative_carts_after_reset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ballot) THEN
    DELETE FROM cumulative_cart;
    DELETE FROM catalog_view;
  END IF;
  RETURN NULL;
END $$;
