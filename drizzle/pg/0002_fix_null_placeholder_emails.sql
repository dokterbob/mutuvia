-- Backfill placeholder emails for phone-only users created before the
-- getTempEmail fix (they have email IS NULL in the database).
-- Better Auth requires a non-null email on every user row; phone-only
-- sign-ups previously stored NULL there.
--
-- Phone numbers are stored in E.164 format (+31612345678), so stripping
-- the leading '+' matches the makePlaceholderEmail() helper in
-- src/lib/placeholder-email.ts.
UPDATE "user"
SET email = REPLACE(phone_number, '+', '') || '@phone.placeholder'
WHERE email IS NULL
  AND phone_number IS NOT NULL;