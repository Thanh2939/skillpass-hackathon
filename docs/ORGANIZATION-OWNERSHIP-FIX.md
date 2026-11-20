# Organization ownership remediation — 2026-11-16

## Incident and scope

The business inbox for Công ty Mẫu A was empty because organization ownership
was not represented in `organization_members`. Certificate `hhahahah`
(`d37e6355-740d-4efe-9c1a-88fda5095df3`) is assigned to the correct organization
(`ed8ac1c5-f206-4f57-89c4-bb0cfb635eac`), with `under_review`, `is_demo=false`,
and `auto_sync=false`.

Migration `20261116050000_org_owner_access_and_membership.sql` was applied by
a delegated agent despite a read-only assignment. The lead subsequently
confirmed the trigger and the owner's active membership in production.
The user explicitly authorized remediation of the resulting ownership risks.

## Confirmed production observations

- `organizations` had permissive INSERT and UPDATE policies for both `anon`
  and `authenticated`. UPDATE used `true` for both USING and WITH CHECK.
- The owner-sync trigger did not remove the previous owner's membership.
- Four active owner memberships existed; none had a user different from the
  organization's current owner at inspection time.
- A transaction-local authenticated-role check as the Mẫu A owner successfully
  read `hhahahah`; the transaction was rolled back. This is an RLS check, not
  an interactive browser test or a production certificate submission.
- Mobile lint and TypeScript checks passed before corrective migration work.

## Boundaries

Do not restore hidden sample organizations or alter certificates to solve this
authorization issue. Do not weaken certificate/evidence RLS or expose private
storage. Preserve authenticated registration, student organization proposals,
and legitimate owner contact edits.

Inspection of current membership consistency does not establish that no past
abuse occurred. A historical access/security audit and the separately reported
relayer authorization concerns remain outside this focused fix.

## Remediation and rollout

Applied `tighten_org_ownership_and_membership_guard` to production successfully.
Local source:
`supabase/migrations/20261116060000_tighten_org_ownership_and_membership_guard.sql`.

- Removed all existing organization DML policies before installing authenticated,
  scoped INSERT/UPDATE policies. Public organization reads remain unchanged.
- A BEFORE trigger restricts ordinary owners to contact and logo changes.
  Identity, ownership, verification and future columns are protected by default.
  Admin and trusted database/service operations retain management privileges.
- Owner changes delete the former owner's membership completely, including a
  change to NULL. The new owner is synchronized automatically.
- Direct manual assignment of owner memberships and modification/deletion of
  canonical owner rows is blocked.
- EXECUTE on all three internal trigger functions is revoked from PUBLIC,
  anon and authenticated; postflight confirmed these permissions are false.

QA suggested permitting arbitrary profile changes via a denylist. This was
not adopted: the proposed comparison was inverted, several suggested columns
do not exist, and verified issuer name/domain changes require admin review.
Current client registration/proposal and contact/logo payloads remain supported.

## Checks

- Local PGlite ownership suite: **27 passed**, covering registration, proposals,
  owner contact changes, blocked identity/KYC/ownership changes, anonymous and
  unrelated-user takeover, member manipulation, privileged admin/service actions,
  transfers and removal of ownership.
- Existing shared-access PGlite suite: **28 assertions passed**, with all current
  migrations applied locally.
- Production transaction-local role checks: owner still reads `hhahahah` and
  can update contact fields; owner self-transfer/KYC changes are rejected;
  unrelated authenticated and anonymous takeover updates affect zero rows.
  All diagnostic DML was rolled back.
- Postflight found zero stale owner memberships.
- Security advisors reported no newly executable internal trigger functions.
  Existing intended public sharing RPC notices and leaked-password-protection
  setting remain; this is not a clean bill of health for the whole project.

No web redeployment is needed for this database-only change. Interactive business
login, actual approval/minting, a historical abuse audit and relayer remediation
were not performed. Recent logs also contain invalid certificate UUID errors
(`cert_...`), which need a separate focused investigation.
