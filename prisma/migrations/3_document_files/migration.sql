-- Documents become real files rather than metadata.
--
-- The bytes live outside the application directory entirely (NIB_STORAGE_ROOT);
-- the database keeps the key that locates them, the SHA-256 of the content and
-- the true byte length. Holding the digest here is what makes the store
-- verifiable: a file whose bytes no longer hash to the recorded value is not
-- served, so silent corruption or tampering on the file share is detected on
-- read rather than discovered at an audit.
--
-- All three are nullable because rows registered before this migration are
-- metadata-only. A row with a null storage_key has no retrievable file.

ALTER TABLE "documents"
  ADD COLUMN "storage_key" TEXT,
  ADD COLUMN "sha256"      TEXT,
  ADD COLUMN "byte_size"   INTEGER;

-- The store is content-addressed, so one digest is one set of bytes on disk no
-- matter how many matters reference it. The index supports finding those
-- references before anything is ever removed from the store.
CREATE INDEX "documents_sha256_idx" ON "documents" ("sha256");

ALTER TABLE "documents"
  ADD CONSTRAINT documents_file_complete_check CHECK (
    (storage_key IS NULL AND sha256 IS NULL AND byte_size IS NULL)
    OR (storage_key IS NOT NULL AND sha256 IS NOT NULL AND byte_size IS NOT NULL)
  );
