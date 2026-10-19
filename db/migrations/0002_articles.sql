-- Forward-only Sprint 6 migration. Wrangler rolls back a failed migration atomically.
-- Retain every immutable identity, timestamp, deletion and existing index/trigger.
CREATE TABLE posts_sprint6 (
  id TEXT PRIMARY KEY NOT NULL COLLATE BINARY
    CHECK (length(id) = 36 AND substr(id, 9, 1) = '-' AND substr(id, 14, 1) = '-'
      AND substr(id, 19, 1) = '-' AND substr(id, 24, 1) = '-'
      AND substr(id, 15, 1) = '4' AND substr(id, 20, 1) IN ('8','9','a','b')
      AND length(replace(id, '-', '')) = 32 AND replace(id, '-', '') NOT GLOB '*[^0-9a-f]*'),
  type TEXT NOT NULL CHECK (type IN ('news','video','meme','changelog','article')),
  url TEXT CHECK (url IS NULL OR (length(url) BETWEEN 1 AND 2048)),
  canonical_url TEXT COLLATE BINARY CHECK (canonical_url IS NULL OR length(canonical_url) BETWEEN 1 AND 2048),
  source_item_id TEXT COLLATE BINARY CHECK (source_item_id IS NULL OR length(trim(source_item_id)) BETWEEN 1 AND 256),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  source TEXT NOT NULL COLLATE BINARY CHECK (length(trim(source)) BETWEEN 1 AND 100),
  origin TEXT NOT NULL CHECK (origin IN ('auto','telegram')),
  preview TEXT CHECK (preview IS NULL OR (json_valid(preview) AND json_type(preview) = 'object')),
  embed TEXT CHECK (embed IS NULL OR (json_valid(embed) AND json_type(embed) = 'object')),
  body TEXT CHECK (body IS NULL OR length(trim(body)) BETWEEN 1 AND 100000),
  "references" TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid("references") AND json_type("references") = 'array' AND json_array_length("references") <= 100),
  published_at TEXT NOT NULL COLLATE BINARY
    CHECK (length(published_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', published_at) IS published_at),
  deleted_at TEXT CHECK (deleted_at IS NULL OR (length(deleted_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', deleted_at) IS deleted_at)),
  CHECK (url IS NOT NULL OR (type IN ('changelog','article') AND canonical_url IS NULL)),
  CHECK (url IS NULL OR canonical_url IS NOT NULL),
  CHECK (type NOT IN ('changelog','article') OR body IS NOT NULL)
) STRICT;

INSERT INTO posts_sprint6 (id,type,url,canonical_url,source_item_id,title,source,origin,preview,embed,body,"references",published_at,deleted_at) SELECT id,type,url,canonical_url,source_item_id,title,source,origin,preview,embed,body,"references",published_at,deleted_at FROM posts;
DROP TABLE posts;
ALTER TABLE posts_sprint6 RENAME TO posts;


CREATE UNIQUE INDEX posts_canonical_url ON posts(canonical_url) WHERE canonical_url IS NOT NULL;
CREATE UNIQUE INDEX posts_source_item_id ON posts(source, source_item_id) WHERE source_item_id IS NOT NULL;
CREATE INDEX posts_visible_feed ON posts(published_at DESC, id DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER posts_immutable_identity
BEFORE UPDATE OF id, published_at, canonical_url, source, source_item_id ON posts
BEGIN
  SELECT RAISE(ABORT, 'Publication identity and ordering are immutable');
END;

CREATE TRIGGER posts_preserve_deletion
BEFORE UPDATE OF deleted_at ON posts
WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT OLD.deleted_at
BEGIN
  SELECT RAISE(ABORT, 'Deletion cannot be changed or cleared');
END;
