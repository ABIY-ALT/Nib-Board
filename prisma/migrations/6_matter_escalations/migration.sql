-- ------------------------------------------------------ matter escalations
--
-- A Board matter can now be formally escalated to a senior officer — the CEO,
-- a Chief or the Board Secretariat — with a recorded reason, and later
-- resolved with a recorded outcome. Escalation does not touch the matter's
-- owner, status or routing; it is a flag that the matter needs management
-- attention, kept as its own history so "who escalated what, to whom, and how
-- it ended" can be answered after the fact.

CREATE TABLE "matter_escalations" (
    "id"              TEXT NOT NULL,
    "matter_id"       TEXT NOT NULL,
    "escalated_by"    TEXT NOT NULL,
    "escalated_to"    TEXT NOT NULL,
    "escalated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason"          TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'OPEN',
    "resolved_by"     TEXT,
    "resolved_at"     TIMESTAMPTZ(6),
    "resolution_note" TEXT,

    CONSTRAINT "matter_escalations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "matter_escalations"
  ADD CONSTRAINT matter_escalations_status_check CHECK (status IN ('OPEN','RESOLVED'));

-- An open escalation has no resolution; a resolved one has a resolver and a
-- time. Without this a half-written row could claim to be resolved by nobody.
ALTER TABLE "matter_escalations"
  ADD CONSTRAINT matter_escalations_resolution_check CHECK (
    (status = 'OPEN' AND resolved_by IS NULL AND resolved_at IS NULL)
    OR (status = 'RESOLVED' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL));

ALTER TABLE "matter_escalations"
  ADD CONSTRAINT matter_escalations_reason_check CHECK (length(btrim(reason)) > 0);

-- At most one open escalation per matter. The API checks first and says so in
-- words; this is what makes two simultaneous clicks unable to open two.
CREATE UNIQUE INDEX "matter_escalations_one_open_idx"
  ON "matter_escalations" ("matter_id") WHERE status = 'OPEN';

CREATE INDEX "matter_escalations_matter_idx" ON "matter_escalations" ("matter_id", "escalated_at" DESC);
CREATE INDEX "matter_escalations_target_idx" ON "matter_escalations" ("escalated_to", "status");

ALTER TABLE "matter_escalations" ADD CONSTRAINT "matter_escalations_matter_id_fkey"
  FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "matter_escalations" ADD CONSTRAINT "matter_escalations_escalated_by_fkey"
  FOREIGN KEY ("escalated_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "matter_escalations" ADD CONSTRAINT "matter_escalations_escalated_to_fkey"
  FOREIGN KEY ("escalated_to") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "matter_escalations" ADD CONSTRAINT "matter_escalations_resolved_by_fkey"
  FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ------------------------------------------------------------ audit trail

-- Escalating and resolving are actions on a matter, so each is appended to that
-- matter's audit_logs trail (whose action column is unconstrained). They are
-- also written to auth_events, so they appear in Governance Settings →
-- Administrative Audit Log beside the other institution-wide actions; that
-- needs the event vocabulary widened, which means replacing the constraint.
ALTER TABLE "auth_events" DROP CONSTRAINT IF EXISTS auth_events_event_check;

ALTER TABLE "auth_events"
  ADD CONSTRAINT auth_events_event_check CHECK (event IN (
    'LOGIN_SUCCEEDED','LOGIN_FAILED','LOGIN_BLOCKED_LOCKED','LOGIN_BLOCKED_RATE_LIMIT',
    'ACCOUNT_LOCKED','LOGOUT','PASSWORD_CHANGED','SESSION_EXPIRED','SESSION_REVOKED',
    'CSRF_REJECTED',
    'USER_CREATED','USER_UPDATED','USER_DEACTIVATED','USER_REACTIVATED',
    'PASSWORD_RESET','ACCOUNT_UNLOCKED',
    'ROLE_CONFIG_UPDATED','MATTER_TYPE_CREATED','MATTER_TYPE_DELETED',
    'DEPARTMENT_CREATED','DEPARTMENT_UPDATED','DEPARTMENT_DELETED',
    'ANNOUNCEMENT_CREATED','ANNOUNCEMENT_UPDATED','ANNOUNCEMENT_PUBLISHED',
    'ANNOUNCEMENT_CANCELLED','ANNOUNCEMENT_DELETED','ANNOUNCEMENT_VIEWED',
    'TASK_REMINDER_SENT',
    'MATTER_ESCALATED','ESCALATION_RESOLVED'));

-- ------------------------------------------------------------ permissions

-- Grant the new permission to the system roles that should hold it out of the
-- box. Only where absent, so re-running is harmless and an administrator who
-- later removes it from a role keeps it removed. Custom roles are left alone.
UPDATE role_definitions
   SET permissions = array_append(permissions, 'escalate_matter'),
       updated_at  = CURRENT_TIMESTAMP
 WHERE role_key IN ('BOARD_SECRETARIAT','CEO','CEO_SECRETARIAT','CHIEF','ADMIN')
   AND NOT ('escalate_matter' = ANY(permissions));
