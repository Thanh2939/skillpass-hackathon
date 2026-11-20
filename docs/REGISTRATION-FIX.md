# Registration flow — 2026-11-18

## Findings

- Latest available production signup logs still report `over_email_send_rate_limit` (HTTP 429).
  This is a server-side email quota, not an MSSV/name validation error.
- Student registration ignored `needsConfirm` and navigated home without a session.
- The service attempted a password login immediately after signup returned a user but no session.
  With email confirmation enabled this is unnecessary and can only report “Email not confirmed”.
- Student submission did not use try/finally, and neither registration screen had a synchronous
  duplicate-click guard.

## Client changes

- Confirmation-required signup shows inbox/spam instructions and a login link, not authenticated home.
- Only actual server sessions are accepted; no confirmation flags, roles, or wallets are fabricated.
- No automatic login, resend, registration retries, SMTP quota bypass, or guessed reset countdown.
- Error codes are propagated to UI with Vietnamese guidance for email quota, sending restrictions,
  invalid addresses, duplicate accounts, weak passwords, request throttling, and connection failures.
  Legacy Auth responses with only `email rate limit exceeded` are normalized to the same quota code.
- Both screens guard duplicate requests, release loading in finally, and preserve fields on failure.
- AppContext serializes signup against other interactive password-auth operations and uses the
  profile's actual role when a session is returned.

## Validation

Behavioral coverage: `scripts/registration.behavior.test.cjs` (9 cases).
Browser coverage: `scripts/registration.ui.test.cjs` (student/business × quota/confirmation/duplicate).
Both suites execute local code with mocked providers. No real signup/email request is made.
Final local checks: lint PASS, typecheck PASS, PWA export PASS, all 6 browser scenarios PASS,
and 22 behavioral tests PASS including the existing certificate-submission and sharing suites.

## Infrastructure blocker

The client fix does not replenish hosted email quota. Configure custom SMTP or a Send Email hook
and set an appropriate rate limit; keep Confirm email enabled. The user must enter provider
credentials privately in the Dashboard, never in chat or frontend environment variables.
No remote Auth configuration or deployment has been changed by this fix.

References:
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/docs/guides/auth/testing-auth-flows
