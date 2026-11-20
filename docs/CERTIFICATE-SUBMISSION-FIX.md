# Certificate submission — 2026-11-18

## Scope

Local client fix only; no remote writes, policy changes, deployment or real certificate submission.
The screenshot is the student-school confirmation screen, not general certificate submission.

## Evidence and changes

- Upload/file reads had no explicit network deadline. AbortController now cancels stalled file
  reads and Supabase HTTP requests; upload failures surface actionable errors instead of returning
  a silent null/local-file fallback. Uploads do not overwrite existing objects.
- Background realtime/polling loads could overlap every three seconds. They are now single-flight.
- A successful submission awaited a notification and, for school confirmation, profile sync.
  These ancillary operations no longer delay reporting the saved certificate as submitted.
- Both submission screens synchronously block duplicate clicks and preserve selected files on error.
  School selection uses the organization ID and revalidates school/verified status before submitting.
- Logs contained UUID parse errors for `cert_...` locators. Evidence lookup now resolves a slug
  before filtering the UUID foreign-key column.
- Read-only production inspection found the organization named “Công ty A” is stored as a verified
  school with academic tier. This is a data-classification issue, not proof that filtering is broken.
  No heuristic name filtering or automatic reclassification was added.

These observations identify client failure modes, not a conclusive reproduction of the user's
original stalled request on production.

## Checks

- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- `npm run build:pwa`: PASS.
- `node --test scripts/certificate-submit.behavior.test.cjs scripts/feedback-sharing.behavior.test.cjs`:
  13 tests PASS; actual TypeScript service/provider exercised with stubs, no remote writes.
- `node scripts/certificate-submit.ui.test.cjs`: 3 local browser scenarios PASS:
  successful submission despite a stalled notification, rejected upload, and aborted upload.
  Supabase HTTP and WebSocket traffic is intercepted.
- Backend and independent QA subagents failed to start (ECONNREFUSED). Lead reviewed relevant
  storage policies directly; do not claim an independent security review.

## Remaining

- Deployment and acceptance on the actual device/account are still needed.
- An aborted write can have committed server-side before its response was lost. No automatic
  retry was added; check pending certificates before manually resubmitting. Full durable
  submission idempotency/atomic certificate+evidence persistence remains separate work.
- Existing advisor notices are not diagnosed as the cause of this incident:
  [public SECURITY DEFINER RPCs](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
  [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
  [RLS evaluation overhead](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
  [duplicate policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)
  and [unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
  Health advisors returned no notices.
