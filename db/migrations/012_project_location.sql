-- Optional proposed site; it is not a claim of site approval or an exact map coordinate.
ALTER TABLE suggestion ADD COLUMN location text CHECK (length(location) <= 300);
