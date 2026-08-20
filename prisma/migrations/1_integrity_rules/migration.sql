-- Guarantees the Prisma schema language cannot express.
--
-- Everything here is a database-level rule rather than an application
-- convention: a CHECK constraint on the fixed vocabularies, a partial index,
-- and the append-only triggers that make the two audit tables evidence rather
-- than merely records. Keep the CHECK lists in step with the TypeScript unions
-- in src/lib/types.ts — they describe the same vocabulary from two directions.

-- ------------------------------------------------------ fixed vocabularies

ALTER TABLE "users"
  ADD CONSTRAINT users_role_check CHECK (role IN
    ('BOARD_SECRETARIAT','CEO','CHIEF','DEPUTY_CHIEF','DIRECTOR','ADMIN'));

ALTER TABLE "matters"
  ADD CONSTRAINT matters_priority_check CHECK (priority IN
    ('Urgent','High','Medium','Low')),
  ADD CONSTRAINT matters_status_check CHECK (status IN
    ('Received','Under Review','Assigned','In Progress','Clarification Required',
     'Implementation Submitted','Under Review / Confirmation','Closed')),
  ADD CONSTRAINT matters_progress_check CHECK (progress BETWEEN 0 AND 100);

ALTER TABLE "documents"
  ADD CONSTRAINT documents_category_check CHECK (category IN
    ('ORIGINAL_BOARD_DOC','RESOLUTION','SUPPORTING',
     'IMPLEMENTATION_EVIDENCE','COMPLETION_REPORT'));

ALTER TABLE "workflow_nodes"
  ADD CONSTRAINT workflow_nodes_level_check CHECK (level IN
    ('BOARD_SECRETARIAT','CEO','CHIEF','DEPUTY_CHIEF','DIRECTOR',
     'REVIEW_CONFIRMATION','CLOSED')),
  ADD CONSTRAINT workflow_nodes_status_check CHECK (status IN
    ('PENDING','ACTIVE','COMPLETED','SKIPPED'));

ALTER TABLE "clarifications"
  ADD CONSTRAINT clarifications_status_check CHECK (status IN ('OPEN','RESOLVED'));

ALTER TABLE "implementation_reports"
  ADD CONSTRAINT implementation_reports_completion_status_check CHECK (completion_status IN
    ('Completed','Partially Completed','Ongoing Monitoring')),
  ADD CONSTRAINT implementation_reports_review_decision_check CHECK (review_decision IN
    ('Approved','Revision Requested'));

ALTER TABLE "auth_events"
  ADD CONSTRAINT auth_events_event_check CHECK (event IN
    ('LOGIN_SUCCEEDED','LOGIN_FAILED','LOGIN_BLOCKED_LOCKED','LOGIN_BLOCKED_RATE_LIMIT',
     'ACCOUNT_LOCKED','LOGOUT','PASSWORD_CHANGED','SESSION_EXPIRED','SESSION_REVOKED',
     'CSRF_REJECTED'));

-- ------------------------------------------------------------ partial index

-- The session sweeper only ever looks at live sessions, so the index does not
-- need to carry the revoked ones.
DROP INDEX IF EXISTS "sessions_expiry_idx";
CREATE INDEX "sessions_expiry_idx" ON "sessions" (expires_at) WHERE revoked_at IS NULL;

-- ------------------------------------------------------- append-only history

-- Spec §8: "Never delete or overwrite historical events." Enforced in the
-- database so that no application bug, and no direct SQL, can rewrite history.
CREATE OR REPLACE FUNCTION audit_logs_are_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_are_immutable();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_are_immutable();

-- Security history is evidence too, and is held to the same rule.
CREATE TRIGGER auth_events_no_update
  BEFORE UPDATE ON auth_events
  FOR EACH ROW EXECUTE FUNCTION audit_logs_are_immutable();

CREATE TRIGGER auth_events_no_delete
  BEFORE DELETE ON auth_events
  FOR EACH ROW EXECUTE FUNCTION audit_logs_are_immutable();
