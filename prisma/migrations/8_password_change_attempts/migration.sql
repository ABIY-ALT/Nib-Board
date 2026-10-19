-- ------------------------------------------------- password-change attempts
--
-- Security assessment VA-006: setting a password can trigger a breached-
-- password lookup against an external range service, so how often one account
-- may do it is now limited. The limiter counts these rows, which also gives
-- Governance Settings → Administrative Audit Log a record of repeated refusals:
--
--   PASSWORD_CHANGE_REJECTED            a new password refused as a known
--                                       breached one
--   PASSWORD_CHANGE_BLOCKED_RATE_LIMIT  an attempt refused for exceeding the
--                                       per-account limit
--
-- Widening the event vocabulary means replacing the constraint, as in
-- 6_matter_escalations. Existing rows are untouched.

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
    'MATTER_ESCALATED','ESCALATION_RESOLVED',
    'PASSWORD_CHANGE_REJECTED','PASSWORD_CHANGE_BLOCKED_RATE_LIMIT'));
