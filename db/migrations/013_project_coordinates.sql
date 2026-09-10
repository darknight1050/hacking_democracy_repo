ALTER TABLE suggestion ADD COLUMN latitude double precision CHECK (latitude BETWEEN -90 AND 90);
ALTER TABLE suggestion ADD COLUMN longitude double precision CHECK (longitude BETWEEN -180 AND 180);
ALTER TABLE suggestion ADD CONSTRAINT coordinate_pair CHECK ((latitude IS NULL) = (longitude IS NULL));
