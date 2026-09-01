CREATE TABLE login_attempts (
  account_normalized text PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_ip text
);

CREATE INDEX login_attempts_locked_until_idx
  ON login_attempts (locked_until)
  WHERE locked_until IS NOT NULL;
