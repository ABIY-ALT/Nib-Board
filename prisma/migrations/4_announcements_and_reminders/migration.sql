-- Permission-based announcements and task reminders.
--
-- Three new tables and three new columns. Nothing existing is dropped or
-- rewritten: every change here is additive or a widening, so a database that
-- has been running the previous schema keeps every row it had and every
-- constraint it satisfied.
--
-- As elsewhere in this schema, the fixed vocabularies are TEXT with a CHECK
-- rather than a Postgres enum, and the matching TypeScript unions live in
-- src/lib/announcements.ts. Adding a value means editing both.

-- ------------------------------------------------------------ notifications

-- One notification model serves the whole application. Until now every
-- notification was about a Board matter; an announcement is not, so the matter
-- reference becomes optional and an announcement reference is added beside it.
-- Dropping NOT NULL cannot invalidate an existing row, and every row written
-- before this migration keeps its matter.
ALTER TABLE "notifications"
  ALTER COLUMN "matter_id" DROP NOT NULL,
  ADD COLUMN "announcement_id" TEXT,
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'Normal';

ALTER TABLE "notifications"
  ADD CONSTRAINT notifications_priority_check CHECK (priority IN
    ('Normal','Important','Urgent'));

-- A notification that points at nothing cannot be opened. It may reference a
-- matter, an announcement, or neither (a purely informational message) — but
-- never both, which would make "open the related item" ambiguous.
ALTER TABLE "notifications"
  ADD CONSTRAINT notifications_single_subject_check CHECK (
    matter_id IS NULL OR announcement_id IS NULL
  );

-- ----------------------------------------------------------- announcements

CREATE TABLE "announcements" (
    "id"                    TEXT NOT NULL,
    "title"                 TEXT NOT NULL,
    "message"               TEXT NOT NULL,
    "type"                  TEXT NOT NULL,
    "priority"              TEXT NOT NULL DEFAULT 'Normal',
    "status"                TEXT NOT NULL DEFAULT 'DRAFT',

    "publish_at"            TIMESTAMPTZ(6),
    "expires_at"            TIMESTAMPTZ(6),

    "target_all"            BOOLEAN NOT NULL DEFAULT false,
    "target_user_ids"       TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_roles"          TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_departments"    TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_business_areas" TEXT[] DEFAULT ARRAY[]::TEXT[],

    "meeting_date"          DATE,
    "meeting_time"          TEXT,
    "location"              TEXT,
    "meeting_link"          TEXT,
    "agenda"                TEXT,
    "participants"          TEXT[] DEFAULT ARRAY[]::TEXT[],

    "related_matter_id"     TEXT,
    "reference"             TEXT,

    "attachment_name"       TEXT,
    "attachment_type"       TEXT,
    "attachment_size"       INTEGER,
    "attachment_key"        TEXT,
    "attachment_sha256"     TEXT,

    "created_by"            TEXT NOT NULL,
    "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by"          TEXT,
    "published_at"          TIMESTAMPTZ(6),
    "cancelled_by"          TEXT,
    "cancelled_at"          TIMESTAMPTZ(6),

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- A meeting is one announcement type rather than a separate kind of record, so
-- the meeting-only fields live on the same table. This keeps them from being
-- filled in on a policy notice, where they would mean nothing and would leak
-- into the meetings-today list on the dashboard.
ALTER TABLE "announcements"
  ADD CONSTRAINT announcements_type_check CHECK (type IN
    ('GENERAL','MEETING','TASK_REMINDER','NOTICE','BOARD_NOTICE','POLICY',
     'SYSTEM','URGENT','EVENT','OTHER')),
  ADD CONSTRAINT announcements_priority_check CHECK (priority IN
    ('Normal','Important','Urgent')),
  ADD CONSTRAINT announcements_status_check CHECK (status IN
    ('DRAFT','PUBLISHED','CANCELLED')),
  ADD CONSTRAINT announcements_meeting_fields_check CHECK (
    type = 'MEETING' OR (
      meeting_date IS NULL AND meeting_time IS NULL AND location IS NULL
      AND meeting_link IS NULL AND agenda IS NULL
      AND COALESCE(array_length(participants, 1), 0) = 0
    )
  ),
  -- The attachment is either wholly present or wholly absent, exactly as for
  -- Board papers in the documents table: a key with no digest cannot be
  -- verified on read, and a digest with no key locates nothing.
  ADD CONSTRAINT announcements_attachment_complete_check CHECK (
    (attachment_key IS NULL AND attachment_sha256 IS NULL AND attachment_size IS NULL
      AND attachment_name IS NULL AND attachment_type IS NULL)
    OR (attachment_key IS NOT NULL AND attachment_sha256 IS NOT NULL
      AND attachment_size IS NOT NULL AND attachment_name IS NOT NULL
      AND attachment_type IS NOT NULL)
  ),
  -- An expiry before publication would hide the announcement the moment it went
  -- out, which is never what was meant.
  ADD CONSTRAINT announcements_window_check CHECK (
    publish_at IS NULL OR expires_at IS NULL OR expires_at > publish_at
  );

CREATE INDEX "announcements_status_idx" ON "announcements" ("status", "publish_at" DESC);
CREATE INDEX "announcements_meeting_idx" ON "announcements" ("type", "meeting_date");
CREATE INDEX "announcements_attachment_sha_idx" ON "announcements" ("attachment_sha256");

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_published_by_fkey"
  FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_cancelled_by_fkey"
  FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_related_matter_id_fkey"
  FOREIGN KEY ("related_matter_id") REFERENCES "matters"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_announcement_id_fkey"
  FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ------------------------------------------------------- read receipts

CREATE TABLE "announcement_reads" (
    "announcement_id" TEXT NOT NULL,
    "user_id"         TEXT NOT NULL,
    "read_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("announcement_id", "user_id")
);

CREATE INDEX "announcement_reads_user_idx" ON "announcement_reads" ("user_id");

ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_fkey"
  FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ------------------------------------------------------- task reminders

CREATE TABLE "task_reminders" (
    "id"           TEXT NOT NULL,
    "matter_id"    TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "sent_by"      TEXT NOT NULL,
    "sent_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason"       TEXT NOT NULL,
    "message"      TEXT,
    "email_sent"   BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "task_reminders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "task_reminders"
  ADD CONSTRAINT task_reminders_reason_check CHECK (reason IN
    ('OVERDUE','DUE_SOON','NOT_STARTED','MANUAL'));

CREATE INDEX "task_reminders_matter_idx" ON "task_reminders" ("matter_id", "recipient_id", "sent_at" DESC);
CREATE INDEX "task_reminders_recipient_idx" ON "task_reminders" ("recipient_id", "sent_at" DESC);

ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_matter_id_fkey"
  FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_recipient_id_fkey"
  FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_sent_by_fkey"
  FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ------------------------------------------------------------ audit trail

-- Announcements and reminders are audited through the record that already
-- exists rather than a new one. Two tables carry history here, and each event
-- goes to the one that can hold it:
--
--   * A reminder is about a Board matter, so it is appended to that matter's
--     own audit_logs trail and shows up on the matter alongside every other
--     action taken on it. audit_logs.action has never been constrained, so
--     nothing needs widening for 'Reminder Sent'.
--
--   * An announcement has no matter — audit_logs.matter_id is NOT NULL and
--     references matters — so it goes to auth_events, which is where the
--     institution-wide administrative record already lives and what the
--     Governance Audit Log screen already reads.
--
-- Both tables are append-only by trigger, so neither record can be rewritten.
--
-- A CHECK constraint cannot be extended in place, so it is replaced. The list
-- below also picks up the governance events (role, matter-type and department
-- administration) that src/lib/security.ts has been emitting since they were
-- added: they were failing the constraint and being recorded under a fallback
-- event name, which made the audit log say the wrong thing about who did what.
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
    'TASK_REMINDER_SENT'));

-- ------------------------------------------------------------------ roles

-- The role vocabulary in the database had fallen behind the application, which
-- has offered BOARD_MEMBER and CEO_SECRETARIAT as assignable roles since they
-- were introduced: provisioning an officer into either was rejected by this
-- constraint. Widening it cannot invalidate an existing row.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE "users"
  ADD CONSTRAINT users_role_check CHECK (role IN
    ('BOARD_SECRETARIAT','BOARD_MEMBER','CEO','CEO_SECRETARIAT',
     'CHIEF','DEPUTY_CHIEF','DIRECTOR','ADMIN'));

-- ------------------------------------------------------------ permissions

-- Grant the new permissions to the system roles that should hold them out of
-- the box, without disturbing any permission an administrator has already
-- configured.
--
-- ensureDefaultRoles() only ever inserts a role definition — it never updates
-- one — precisely so that an administrator's changes in the Roles & Permissions
-- screen survive a restart. That also means a role definition already in the
-- database will never learn about a permission added later, which is what this
-- does, once. Afterwards the screen is authoritative: a permission removed
-- there stays removed.
--
-- `array_append` only where the key is absent, so re-running is harmless and no
-- role ends up holding the same key twice.
CREATE OR REPLACE FUNCTION nib_grant_permission(p_role_key TEXT, p_permission TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE role_definitions
     SET permissions = array_append(permissions, p_permission),
         updated_at  = CURRENT_TIMESTAMP
   WHERE role_key = p_role_key
     AND NOT (p_permission = ANY(permissions));
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  full_control  TEXT[] := ARRAY['ANNOUNCEMENT_VIEW','ANNOUNCEMENT_CREATE','ANNOUNCEMENT_EDIT',
                                'ANNOUNCEMENT_PUBLISH','ANNOUNCEMENT_DELETE',
                                'TASK_REMINDER_VIEW','TASK_REMINDER_SEND'];
  can_announce  TEXT[] := ARRAY['ANNOUNCEMENT_VIEW','ANNOUNCEMENT_CREATE','ANNOUNCEMENT_EDIT',
                                'ANNOUNCEMENT_PUBLISH',
                                'TASK_REMINDER_VIEW','TASK_REMINDER_SEND'];
  can_chase     TEXT[] := ARRAY['ANNOUNCEMENT_VIEW','TASK_REMINDER_VIEW','TASK_REMINDER_SEND'];
  read_only     TEXT[] := ARRAY['ANNOUNCEMENT_VIEW'];
  perm          TEXT;
BEGIN
  FOREACH perm IN ARRAY full_control LOOP
    PERFORM nib_grant_permission('BOARD_SECRETARIAT', perm);
    PERFORM nib_grant_permission('ADMIN', perm);
  END LOOP;

  FOREACH perm IN ARRAY can_announce LOOP
    PERFORM nib_grant_permission('CEO', perm);
    PERFORM nib_grant_permission('CEO_SECRETARIAT', perm);
  END LOOP;

  FOREACH perm IN ARRAY can_chase LOOP
    PERFORM nib_grant_permission('CHIEF', perm);
    PERFORM nib_grant_permission('DEPUTY_CHIEF', perm);
  END LOOP;

  FOREACH perm IN ARRAY read_only LOOP
    PERFORM nib_grant_permission('DIRECTOR', perm);
    PERFORM nib_grant_permission('BOARD_MEMBER', perm);
  END LOOP;
END $$;

DROP FUNCTION nib_grant_permission(TEXT, TEXT);
