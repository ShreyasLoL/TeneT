CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  slug text NOT NULL,
  name text NOT NULL,
  look jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL,
  archived_at timestamptz,
  CONSTRAINT areas_user_slug_unique UNIQUE (user_id, slug)
);

CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  area_id uuid NOT NULL REFERENCES areas(id),
  kind text NOT NULL,
  title text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  deadline date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trackables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  key text NOT NULL,
  version integer NOT NULL,
  area_id uuid NOT NULL REFERENCES areas(id),
  goal_id uuid REFERENCES goals(id),
  kind text NOT NULL,
  label text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule jsonb NOT NULL,
  rule jsonb,
  weight numeric NOT NULL,
  scored boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  archived_from date,
  CONSTRAINT trackables_user_key_version_unique UNIQUE (user_id, key, version)
);

CREATE TABLE IF NOT EXISTS events (
  seq bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  day date NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  user_id uuid NOT NULL REFERENCES users(id),
  day date NOT NULL,
  trackable_key text NOT NULL,
  trackable_version integer NOT NULL,
  value jsonb NOT NULL,
  PRIMARY KEY (user_id, day, trackable_key)
);

CREATE TABLE IF NOT EXISTS days (
  user_id uuid NOT NULL REFERENCES users(id),
  day date NOT NULL,
  sealed_at timestamptz NOT NULL,
  score integer,
  results jsonb NOT NULL,
  reflection text,
  streak integer NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS events_user_day_idx ON events(user_id, day);
CREATE INDEX IF NOT EXISTS entries_user_day_idx ON entries(user_id, day);

CREATE OR REPLACE FUNCTION reject_event_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS events_reject_update_delete ON events;
CREATE TRIGGER events_reject_update_delete
BEFORE UPDATE OR DELETE ON events
FOR EACH ROW EXECUTE FUNCTION reject_event_history_mutation();

CREATE OR REPLACE FUNCTION reject_sealed_day_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'sealed days are immutable';
END;
$$;

DROP TRIGGER IF EXISTS days_reject_update_delete ON days;
CREATE TRIGGER days_reject_update_delete
BEFORE UPDATE OR DELETE ON days
FOR EACH ROW EXECUTE FUNCTION reject_sealed_day_mutation();

CREATE OR REPLACE FUNCTION reject_entry_write_on_sealed_day()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_user uuid;
  target_day date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_user := OLD.user_id;
    target_day := OLD.day;
  ELSE
    target_user := NEW.user_id;
    target_day := NEW.day;
  END IF;

  IF EXISTS (
    SELECT 1 FROM days
    WHERE user_id = target_user AND day = target_day
  ) THEN
    RAISE EXCEPTION 'day is sealed';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entries_reject_sealed_day_write ON entries;
CREATE TRIGGER entries_reject_sealed_day_write
BEFORE INSERT OR UPDATE OR DELETE ON entries
FOR EACH ROW EXECUTE FUNCTION reject_entry_write_on_sealed_day();

CREATE OR REPLACE FUNCTION reject_entry_event_on_sealed_day()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type = 'entry_logged' AND EXISTS (
    SELECT 1 FROM days
    WHERE user_id = NEW.user_id AND day = NEW.day
  ) THEN
    RAISE EXCEPTION 'day is sealed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_reject_entry_on_sealed_day ON events;
CREATE TRIGGER events_reject_entry_on_sealed_day
BEFORE INSERT ON events
FOR EACH ROW EXECUTE FUNCTION reject_entry_event_on_sealed_day();
