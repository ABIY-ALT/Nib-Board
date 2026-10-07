-- ------------------------------------------------- permission enforcement
--
-- From this release every key in Governance Settings → Roles & Permissions is
-- enforced on the server. Until now the matter-workflow and administration
-- keys below were only displayed: the code decided those actions by role, so
-- what a system role row held for them had no effect, and on databases seeded
-- by earlier releases it disagrees with what each role can actually do (the
-- CEO, for one, has no `see_all`, yet sees every matter).
--
-- Enforcing those rows as they stand would silently change who can do what on
-- the day of the deploy. Instead, this sets the workflow and administration
-- keys of each system role, once, to exactly what the role is permitted today,
-- so the screen starts out telling the truth and nobody gains or loses anything
-- by the upgrade. From then on the screen is authoritative.
--
-- Only these fourteen keys are rewritten. Announcement and reminder keys were
-- already enforced, so whatever an administrator configured for them is left
-- alone; custom roles are left alone entirely. Re-running is harmless.

DO $$
DECLARE
  workflow TEXT[] := ARRAY[
    'see_all', 'register_matter', 'route_matter', 'accept_ownership',
    'request_clarification', 'reply_clarification', 'attach_document',
    'submit_report', 'confirm_completion', 'close_matter',
    'view_analytics', 'view_audit_trail',
    'administer_users', 'configure_settings'];
BEGIN
  UPDATE role_definitions AS r
     SET permissions = v.granted || ARRAY(
           SELECT p FROM unnest(r.permissions) AS p WHERE NOT (p = ANY(workflow))),
         updated_at  = CURRENT_TIMESTAMP
    FROM (VALUES
      ('BOARD_MEMBER', ARRAY[
        'see_all', 'request_clarification', 'reply_clarification', 'attach_document',
        'view_analytics', 'view_audit_trail']),
      ('BOARD_SECRETARIAT', ARRAY[
        'see_all', 'register_matter', 'route_matter', 'accept_ownership',
        'request_clarification', 'reply_clarification', 'attach_document',
        'confirm_completion', 'close_matter', 'view_analytics', 'view_audit_trail',
        'administer_users', 'configure_settings']),
      ('CEO', ARRAY[
        'see_all', 'route_matter', 'accept_ownership', 'request_clarification',
        'reply_clarification', 'attach_document', 'submit_report',
        'confirm_completion', 'close_matter', 'view_analytics']),
      ('CEO_SECRETARIAT', ARRAY[
        'see_all', 'route_matter', 'accept_ownership', 'request_clarification',
        'reply_clarification', 'attach_document', 'view_analytics']),
      ('CHIEF', ARRAY[
        'route_matter', 'accept_ownership', 'request_clarification',
        'reply_clarification', 'attach_document', 'submit_report',
        'confirm_completion', 'view_analytics']),
      ('DEPUTY_CHIEF', ARRAY[
        'route_matter', 'accept_ownership', 'request_clarification',
        'reply_clarification', 'attach_document', 'confirm_completion']),
      ('DIRECTOR', ARRAY[
        'accept_ownership', 'request_clarification', 'reply_clarification',
        'attach_document', 'submit_report']),
      ('ADMIN', ARRAY[
        'see_all', 'register_matter', 'accept_ownership', 'request_clarification',
        'reply_clarification', 'attach_document', 'submit_report',
        'confirm_completion', 'close_matter', 'view_analytics', 'view_audit_trail',
        'administer_users', 'configure_settings'])
    ) AS v(role_key, granted)
   WHERE r.role_key = v.role_key;
END $$;
