-- Delivery is explicitly reported, never inferred from election results.
ALTER TABLE suggestion ADD COLUMN delivery_status text NOT NULL DEFAULT 'not_reported'
  CHECK (delivery_status IN ('not_reported','planned','in_progress','completed','cancelled'));
ALTER TABLE suggestion ADD COLUMN delivery_note text NOT NULL DEFAULT '' CHECK (length(delivery_note) <= 1000);
ALTER TABLE suggestion ADD COLUMN delivery_updated_at timestamptz;
