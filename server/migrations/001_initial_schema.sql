-- Up Migration

CREATE TABLE garages (
  id          TEXT PRIMARY KEY,
  name        VARCHAR(120) NOT NULL CHECK (char_length(btrim(name)) >= 1),
  time_zone   VARCHAR(64)  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  version     INTEGER      NOT NULL DEFAULT 1 CHECK (version > 0)
);

-- Exactly one owner per garage; the owner is the only account that can sign in.
CREATE TABLE owner_users (
  id             TEXT PRIMARY KEY,
  garage_id      TEXT         NOT NULL UNIQUE REFERENCES garages (id),
  name           VARCHAR(120) NOT NULL CHECK (char_length(btrim(name)) >= 1),
  email          VARCHAR(254) NOT NULL CHECK (email = lower(email)),
  password_hash  TEXT         NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  version        INTEGER      NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE UNIQUE INDEX uq_owner_users_email ON owner_users (email);

-- Application-owned sessions. Only a hash of the session ID is stored; the CSRF
-- token is stored itself because it must be returned to the client.
CREATE TABLE sessions (
  id                   TEXT PRIMARY KEY,
  session_id_hash      TEXT        NOT NULL UNIQUE,
  owner_user_id        TEXT        NOT NULL REFERENCES owner_users (id),
  csrf_token           TEXT        NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  idle_expires_at      TIMESTAMPTZ NOT NULL,
  absolute_expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at           TIMESTAMPTZ
);
CREATE INDEX idx_sessions_owner ON sessions (owner_user_id);
CREATE INDEX idx_sessions_absolute_expiry ON sessions (absolute_expires_at);
CREATE INDEX idx_sessions_revoked ON sessions (revoked_at) WHERE revoked_at IS NOT NULL;

CREATE TABLE mechanics (
  id           TEXT PRIMARY KEY,
  garage_id    TEXT         NOT NULL REFERENCES garages (id),
  name         VARCHAR(120) NOT NULL CHECK (char_length(btrim(name)) >= 1),
  phone        VARCHAR(32),
  skills       VARCHAR(500),
  duty_status  VARCHAR(16)  NOT NULL DEFAULT 'available'
               CHECK (duty_status IN ('available', 'busy', 'off_duty')),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  version      INTEGER      NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at  TIMESTAMPTZ,
  CONSTRAINT uq_mechanics_garage_id UNIQUE (garage_id, id)
);
CREATE INDEX idx_mechanics_garage_status ON mechanics (garage_id, duty_status) WHERE archived_at IS NULL;
CREATE INDEX idx_mechanics_garage_name ON mechanics (garage_id, lower(name));
CREATE INDEX idx_mechanics_garage_updated ON mechanics (garage_id, updated_at DESC);

CREATE TABLE jobs (
  id                               TEXT PRIMARY KEY,
  garage_id                        TEXT         NOT NULL REFERENCES garages (id),
  job_number                       VARCHAR(32)  NOT NULL,
  status                           VARCHAR(16)  NOT NULL
                                   CHECK (status IN ('open', 'in_progress', 'waiting', 'completed', 'cancelled')),
  customer_name                    VARCHAR(160) NOT NULL CHECK (char_length(btrim(customer_name)) >= 1),
  customer_phone                   VARCHAR(32),
  vehicle_registration             VARCHAR(32)  NOT NULL CHECK (char_length(btrim(vehicle_registration)) >= 1),
  normalized_vehicle_registration  VARCHAR(32)  NOT NULL CHECK (char_length(normalized_vehicle_registration) >= 1),
  vehicle_make                     VARCHAR(80),
  vehicle_model                    VARCHAR(80),
  vehicle_year                     INTEGER CHECK (vehicle_year >= 1886),
  odometer_km                      INTEGER CHECK (odometer_km >= 0),
  work_requested                   TEXT         NOT NULL CHECK (char_length(work_requested) BETWEEN 1 AND 4000),
  diagnosis                        TEXT CHECK (char_length(diagnosis) <= 4000),
  work_performed                   TEXT CHECK (char_length(work_performed) <= 4000),
  internal_notes                   TEXT CHECK (char_length(internal_notes) <= 4000),
  assigned_mechanic_id             TEXT,
  created_by_user_id               TEXT         NOT NULL REFERENCES owner_users (id),
  created_at                       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  version                          INTEGER      NOT NULL DEFAULT 1 CHECK (version > 0),
  archived_at                      TIMESTAMPTZ,
  CONSTRAINT uq_jobs_garage_id UNIQUE (garage_id, id),
  CONSTRAINT uq_jobs_job_number UNIQUE (garage_id, job_number),
  -- Tenant-aware FK: a job can only reference a mechanic of the same garage.
  CONSTRAINT fk_jobs_mechanic FOREIGN KEY (garage_id, assigned_mechanic_id)
    REFERENCES mechanics (garage_id, id),
  CONSTRAINT ck_jobs_in_progress_has_mechanic
    CHECK (status <> 'in_progress' OR assigned_mechanic_id IS NOT NULL)
);

-- One active (non-archived, non-terminal) job per normalized vehicle registration.
CREATE UNIQUE INDEX uq_jobs_active_vehicle
  ON jobs (garage_id, normalized_vehicle_registration)
  WHERE archived_at IS NULL AND status NOT IN ('completed', 'cancelled');

-- A mechanic can work at most one in-progress job.
CREATE UNIQUE INDEX uq_jobs_one_in_progress_per_mechanic
  ON jobs (garage_id, assigned_mechanic_id)
  WHERE status = 'in_progress' AND assigned_mechanic_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX idx_jobs_garage_status_updated ON jobs (garage_id, status, updated_at DESC);
CREATE INDEX idx_jobs_garage_updated ON jobs (garage_id, updated_at DESC, id DESC);
CREATE INDEX idx_jobs_garage_created ON jobs (garage_id, created_at DESC);
CREATE INDEX idx_jobs_garage_registration ON jobs (garage_id, normalized_vehicle_registration);
CREATE INDEX idx_jobs_garage_mechanic ON jobs (garage_id, assigned_mechanic_id);

-- Per-garage, per-year job number sequence, allocated inside the creating transaction.
CREATE TABLE job_number_counters (
  garage_id   TEXT    NOT NULL REFERENCES garages (id),
  year        INTEGER NOT NULL,
  last_value  INTEGER NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (garage_id, year)
);

CREATE TABLE job_history (
  id             TEXT PRIMARY KEY,
  garage_id      TEXT        NOT NULL REFERENCES garages (id),
  job_id         TEXT        NOT NULL,
  actor_user_id  TEXT        NOT NULL REFERENCES owner_users (id),
  from_status    VARCHAR(16) NOT NULL
                 CHECK (from_status IN ('open', 'in_progress', 'waiting', 'completed', 'cancelled')),
  to_status      VARCHAR(16) NOT NULL
                 CHECK (to_status IN ('open', 'in_progress', 'waiting', 'completed', 'cancelled')),
  note           VARCHAR(500),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_job_history_job FOREIGN KEY (garage_id, job_id) REFERENCES jobs (garage_id, id)
);
CREATE INDEX idx_job_history_job ON job_history (garage_id, job_id, created_at DESC, id DESC);
CREATE INDEX idx_job_history_completed ON job_history (garage_id, created_at) WHERE to_status = 'completed';

-- History is append-only.
CREATE FUNCTION job_history_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'job_history is append-only';
END;
$$;

CREATE TRIGGER trg_job_history_append_only
  BEFORE UPDATE OR DELETE ON job_history
  FOR EACH ROW EXECUTE FUNCTION job_history_is_append_only();

-- Down Migration

DROP TRIGGER IF EXISTS trg_job_history_append_only ON job_history;
DROP FUNCTION IF EXISTS job_history_is_append_only();
DROP TABLE IF EXISTS job_history;
DROP TABLE IF EXISTS job_number_counters;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS mechanics;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS owner_users;
DROP TABLE IF EXISTS garages;
