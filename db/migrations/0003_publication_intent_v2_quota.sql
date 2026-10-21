-- Publisher v2 audit is append-only and separate from the public post shape.
-- Existing posts remain readable and are deliberately not backfilled into quota.
CREATE TABLE publication_audit (
  intent_id TEXT PRIMARY KEY NOT NULL COLLATE BINARY
    CHECK (length(intent_id) BETWEEN 8 AND 256),
  post_id TEXT NOT NULL UNIQUE COLLATE BINARY,
  intent_version INTEGER NOT NULL CHECK (intent_version IN (1, 2)),
  content_hash TEXT NOT NULL COLLATE BINARY
    CHECK (length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'),
  semantic_identity TEXT NOT NULL COLLATE BINARY
    CHECK (length(semantic_identity) = 64 AND semantic_identity NOT GLOB '*[^0-9a-f]*'),
  review_route TEXT CHECK (review_route IS NULL OR review_route IN ('independently_verified', 'trusted_publisher')),
  editorial TEXT CHECK (editorial IS NULL OR (json_valid(editorial) AND json_type(editorial) = 'object')),
  recorded_at TEXT NOT NULL COLLATE BINARY
    CHECK (length(recorded_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', recorded_at) IS recorded_at),
  FOREIGN KEY (post_id) REFERENCES posts(id)
) STRICT;

CREATE TABLE automatic_publication_slots (
  utc_day TEXT NOT NULL COLLATE BINARY
    CHECK (length(utc_day) = 10 AND date(utc_day) IS utc_day),
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 5),
  post_id TEXT NOT NULL UNIQUE COLLATE BINARY,
  PRIMARY KEY (utc_day, slot)
) STRICT;

-- The Worker/D1 clock determines the UTC day. The aggregate insert is within
-- the post INSERT transaction; it neither trusts client time nor uses a
-- process-local counter. A sixth unique automatic post aborts the whole write.
CREATE TRIGGER posts_reserve_automatic_daily_slot
BEFORE INSERT ON posts
WHEN NEW.origin = 'auto'
BEGIN
  INSERT INTO automatic_publication_slots (utc_day, slot, post_id)
  SELECT strftime('%Y-%m-%d', 'now'), COALESCE(MAX(slot), 0) + 1, NEW.id
  FROM automatic_publication_slots
  WHERE utc_day = strftime('%Y-%m-%d', 'now')
  HAVING COALESCE(MAX(slot), 0) < 5;
  SELECT CASE WHEN changes() != 1
    THEN RAISE(ABORT, 'automatic_publication_daily_quota') END;
END;

CREATE TRIGGER publication_audit_immutable
BEFORE UPDATE ON publication_audit
BEGIN
  SELECT RAISE(ABORT, 'Publication audit is immutable');
END;

CREATE TRIGGER automatic_publication_slot_immutable
BEFORE UPDATE ON automatic_publication_slots
BEGIN
  SELECT RAISE(ABORT, 'Automatic publication slots are immutable');
END;
