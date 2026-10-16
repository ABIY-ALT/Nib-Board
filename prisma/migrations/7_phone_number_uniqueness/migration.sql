-- ------------------------------------------------- one account per phone number
--
-- Security assessment finding "Insufficient Phone Number Uniqueness
-- Validation": two officer accounts could be given the same phone number. The
-- API now stores every number in one form, "+251 NN NNN NNNN" (normalizePhone
-- in src/lib/users.ts), and refuses a number another account already holds.
-- The unique index at the end makes the database refuse it too, whatever path
-- the write takes and however two requests interleave.
--
-- Existing rows are brought into line first, or the index could not be built.

-- 1. A blank number is no number. The API stores blank as NULL, but two ''
--    rows would collide in the index where two NULLs do not.
UPDATE "users" SET phone = NULL WHERE phone IS NOT NULL AND btrim(phone) = '';

-- 2. Rewrite every number the application's rule accepts (isValidPhone: "+251"
--    or "0", then nine digits, ignoring spaces, hyphens, dots and brackets)
--    into the stored form, so "0911234567" and "+251 911 234 567" become the
--    same value. A value the rule does not accept is left as it is.
WITH parsed AS (
  SELECT id,
         (regexp_match(regexp_replace(phone, '[[:space:]().-]', '', 'g'),
                       '^(?:\+251|0)([1-9][0-9]{8})$'))[1] AS national
  FROM "users"
  WHERE phone IS NOT NULL
)
UPDATE "users" u
SET phone = '+251 ' || substr(p.national, 1, 2) || ' ' || substr(p.national, 3, 3)
            || ' ' || substr(p.national, 6, 4)
FROM parsed p
WHERE u.id = p.id AND p.national IS NOT NULL;

-- 3. Where several accounts now hold the same number, one keeps it and the
--    others have it removed: an active account before a deactivated one, then
--    the account provisioned first (a seeded account has no USER_CREATED event
--    and counts as first). Each removal is written to the security record, so
--    the account's history says what happened to its number and why.
WITH ranked AS (
  SELECT u.id, u.email, u.phone,
         first_value(u.id) OVER holders AS keeper,
         row_number() OVER holders AS position
  FROM "users" u
  LEFT JOIN LATERAL (
    SELECT min(e.occurred_at) AS provisioned_at
    FROM "auth_events" e
    WHERE e.user_id = u.id AND e.event = 'USER_CREATED'
  ) c ON true
  WHERE u.phone IS NOT NULL
  WINDOW holders AS (
    PARTITION BY u.phone
    ORDER BY u.is_active DESC, c.provisioned_at ASC NULLS FIRST, u.id
  )
),
cleared AS (
  UPDATE "users" u
  SET phone = NULL
  FROM ranked r
  WHERE u.id = r.id AND r.position > 1
  RETURNING u.id, u.email, r.phone, r.keeper
)
INSERT INTO "auth_events" (event, user_id, email_attempted, detail)
SELECT 'USER_UPDATED', id, email,
       'phone ' || phone || ' removed: account ' || keeper
       || ' holds the same number — by migration 7_phone_number_uniqueness'
FROM cleared;

-- 4. The rule itself. Postgres treats NULLs as distinct, so any number of
--    accounts may still have no phone number.
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
