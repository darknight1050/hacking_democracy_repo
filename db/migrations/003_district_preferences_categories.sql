ALTER TABLE district ADD COLUMN is_citywide boolean NOT NULL DEFAULT false;
ALTER TABLE district ADD COLUMN theme text NOT NULL DEFAULT '';
INSERT INTO district(name,is_citywide,theme) VALUES('City-wide',true,'Ideas for multiple or all districts');
CREATE UNIQUE INDEX one_citywide_district ON district(is_citywide) WHERE is_citywide;
ALTER TABLE event ADD COLUMN selected_district_percent integer NOT NULL DEFAULT 70 CHECK(selected_district_percent BETWEEN 0 AND 100);
ALTER TABLE ballot ADD COLUMN district_ids integer[] NOT NULL DEFAULT '{}';
CREATE TABLE category(id serial PRIMARY KEY,name text UNIQUE NOT NULL);
INSERT INTO category(name) VALUES ('Community'),('Environment'),('Transport'),('Food'),('Technology'),('Arts & culture'),('Health & safety'),('Education'),('Work & industry');
CREATE TABLE suggestion_category (
  suggestion_id uuid REFERENCES suggestion(id) ON DELETE CASCADE,
  category_id integer REFERENCES category(id),
  PRIMARY KEY(suggestion_id,category_id)
);
INSERT INTO suggestion_category(suggestion_id,category_id) SELECT id,1 FROM suggestion;
-- Deferred checks let a transaction insert the idea first and then its categories.
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
