-- Administering an account is a security event, and belongs in the same
-- append-only record as sign-ins and password changes: who provisioned an
-- officer, who changed a role, who deactivated whom. Without these the security
-- history would show people using accounts that no record says were created.
--
-- A CHECK constraint cannot be extended in place, so it is replaced.

ALTER TABLE "auth_events" DROP CONSTRAINT auth_events_event_check;

ALTER TABLE "auth_events"
  ADD CONSTRAINT auth_events_event_check CHECK (event IN (
    'LOGIN_SUCCEEDED','LOGIN_FAILED','LOGIN_BLOCKED_LOCKED','LOGIN_BLOCKED_RATE_LIMIT',
    'ACCOUNT_LOCKED','LOGOUT','PASSWORD_CHANGED','SESSION_EXPIRED','SESSION_REVOKED',
    'CSRF_REJECTED',
    'USER_CREATED','USER_UPDATED','USER_DEACTIVATED','USER_REACTIVATED',
    'PASSWORD_RESET','ACCOUNT_UNLOCKED'));
