# Invite-only beta launch readiness

This checklist is an evidence-backed release gate, not a declaration that the beta is
production-ready. “Verified” refers to the current code and local checks; staging evidence
and operational approvals are still required before launch.

## Prioritised checklist

| Priority | Launch item and pass condition | Status | Evidence / remaining work |
| --- | --- | --- | --- |
| P0 | Production and staging fail closed: required secrets and canonical HTTPS origin are validated at startup; demo credentials and seed paths cannot run outside development. | Already verified | Runtime-config tests passed; the isolated local staging Compose profile started with demo sign-in disabled, invitations required, and no demo seed data. This does not verify a hosted production environment. |
| P0 | Beta access is invite-only: an unexpired invitation can create exactly one account; missing, expired, and reused codes are rejected; invitation codes are stored hashed and issued only by an operator. | Already verified | On the isolated staging profile, missing, invalid, and expired codes were rejected; two concurrent redemptions of one issued code produced exactly one account and one rejection. Codes are hash-stored and issued by `npm run db:invite`. A real invite-distribution/email process remains an operator/service decision. |
| P0 | Session and account controls: production cookies are Secure, sessions expire and can be revoked on logout, unsafe browser requests are same-origin, and passwords meet a documented minimum. | Already verified | The staging profile emitted Secure/HttpOnly cookies; integration checks covered same-origin rejection, logout revocation, password-protected account deletion, and invalidation after deletion. |
| P0 | Profile privacy and media: members can edit only their own profile; profile images are stored locally, content-checked, and served only to the owner or a currently eligible member; blocked people cannot retrieve them. | Already verified | Synthetic integration checks covered profile ownership, URL-photo rejection, authorized photo access, and media denial after blocking. Production object storage and scanning remain separate operational requirements. |
| P0 | Relationship access controls: only eligible members can discover profiles or send introductions; only an introduction recipient can answer; only active, unblocked match participants can read or send messages; duplicate acceptance creates one match and conversation. | Already verified | The synthetic API journey passed discovery, introduction, recipient-only acceptance, duplicate acceptance, participant-only messaging, unmatching, and block checks for discovery/media/messages. |
| P0 | Safety and moderation: reports are visible and mutable only to authorised moderators; members cannot review reports; block/unmatch stop access; account deletion requires the account password and removes associated data. | Already verified | Integration checks covered moderator-only report visibility, blocking, unmatching, and password-protected deletion. A synthetic report remained in the moderator queue across an app-container restart; that test report was removed afterward. |
| P0 | Private staging is isolated from public traffic and real member data; the deployed image, database, origin, secrets, and invite flow are verified with synthetic accounts. | Dependent on external service or human decision | A separate loopback-only local staging Compose profile and isolated database were started, migrated, health-checked, and exercised with synthetic invite flows. No hosted staging, real HTTPS proxy/domain, or operator credentials are configured. |
| P0 | Tested release operations: a named release is backed up; migrations are reviewed and applied once; restore is rehearsed; rollback to the prior image and compatible schema is demonstrated. | Dependent on external service or human decision | Release, migration, backup, restore, and rollback steps are documented; a real rehearsal requires an approved staging host and backup destination. |
| P1 | Email ownership and recovery: invitees verify an email address before discovery, can recover access, and moderator accounts use MFA. | Dependent on external service or human decision | Requires an email-delivery provider, verified sender/domain, recovery policy, and moderator MFA decision. These controls are not represented as complete by this local implementation. |
| P1 | Abuse controls: login, signup, introductions, chat, uploads, and reports have measured rate limits and alerts that remain effective across replicas. | Dependent on external service or human decision | No distributed rate limiter, edge/WAF, alerting, or abuse-response operation is configured. Select and test these controls in staging. |
| P1 | Media operations: production photos use private object storage, malware/content scanning, retention rules, and tested deletion; no user media is copied into public assets. | Dependent on external service or human decision | The pilot stores uploaded photos in PostgreSQL. Local access controls can be tested, but production storage, scanning, retention, and deletion require provider configuration and an approved policy. |
| P1 | Privacy and legal review: approve the privacy notice, consent/community terms, retention/deletion rules, lawful basis, DPIA assessment, and an incident/contact process for an Ireland beta. | Dependent on external service or human decision | Requires a designated human owner and appropriate legal/privacy review before real members are invited. |
| P1 | Operational readiness: named on-call owner, health/latency/error alerts, database capacity, encrypted backups, restore evidence, and incident runbook are accepted. | Dependent on external service or human decision | No hosting, monitoring, paging, or backup destination is configured. |
| P2 | Accessibility and product review: keyboard and screen-reader journeys, contrast, consent copy, and responsive layouts are reviewed at supported breakpoints. | Fixable locally | The pilot landing layout and desktop/mobile illustration placement were observed in a prior browser check; a complete accessibility review has not been run. |

## Pilot claims checked against source

The local source supports the pilot’s main interaction claims: `profile` writes derive the owner
from the session, message reads/writes check match participation and active/block state,
moderation endpoints check the moderator role, and account deletion confirms the password.
Prior pilot runtime checks also exercised these paths. Those checks do not replace the
automated regression suite or a staging rehearsal.

The following pilot claims needed qualification: Compose was configured to seed demo users on
every startup with a known local password; sign-up had no invitation gate; non-development
configuration had no startup validation; the profile editor allowed arbitrary remote photo
URLs; and no application test files, release procedure, or backup/restore runbook were present.
The photo editor stored uploaded images as data URLs in PostgreSQL rather than using a private
media service.

The local hardening implementation now conditionally seeds only development, validates
staging/production configuration at container startup, requires invitations outside
development, shortens and revokes sessions, checks same-origin mutations, and serves photos
through access-controlled endpoints. The repository's runtime-config tests and synthetic API
integration suite passed; an isolated local staging profile also passed invite, session,
account-deletion, and migration checks. Browser smoke checks covered signup navigation, the
“See how it works” anchor, and the landing illustration at desktop/mobile widths. A REA
browser-scenario capture has not been completed.

## Verification record (local only)

- Runtime-config tests, TypeScript check, production build, and `npm audit --audit-level=high`
  passed; the audit reported zero known vulnerabilities.
- Docker Compose built and started the development app and PostgreSQL; migrations applied and
  the health endpoint returned `{"status":"ok"}`.
- `npm run test:integration` passed with synthetic accounts, including profile ownership,
  origin checks, media access, recipient-only acceptance, duplicate acceptance, messaging
  permissions, moderator-only reports, unmatching, blocking, logout revocation, and
  password-protected deletion.
- A separate loopback-only staging Compose project migrated a fresh database and passed
  health, demo-disabled/invite-required, missing/invalid/expired invitation, concurrent
  one-time redemption, Secure/HttpOnly cookie, profile access, and account-deletion checks.
  The isolated staging containers, database volume, and temporary secrets were removed.
- A synthetic report persisted across a development app-container restart and remained
  moderator-visible; the report itself was deleted after verification.
- Existing browser tooling verified the landing signup CTA, “See how it works” anchor, and
  illustration at desktop/mobile widths. It did not provide the requested full REA journey.
- Still unverified: hosted staging behind its real HTTPS ingress, real invite delivery,
  container image vulnerability scan, private backup/restore rehearsal, operational alerts,
  and complete accessibility/privacy/legal review.
The initial npm audit found a high-severity ReDoS advisory in Prisma’s transitive `effect`
dependency (`CVE-2026-121707`); an npm override now resolves `effect@3.22.1`, and a fresh
`npm audit` reports zero vulnerabilities. A container image vulnerability scan remains
unverified.

## Staging inputs still required

Before any external staging deployment, an operator must provide:

- Hosting provider, region, account/subscription, private ingress or VPN/SSH access, and an
  approved staging hostname.
- A managed PostgreSQL endpoint and credentials, network allow-list, TLS requirements, and a
  private encrypted backup destination with retention and restore access.
- A generated `SESSION_SECRET` of at least 64 random characters and the exact HTTPS
  `APP_ORIGIN`; secrets must be injected through the host’s secret manager, not committed.
- An invitation distribution process and, before email verification/recovery is enabled, an
  email provider, verified sender domain, API credentials, and approved message templates.
- Monitoring/error-reporting destination, alert recipients, log-retention policy, and a
  named operational and privacy/moderation owner.

No external deployment is performed by this repository task.

## Release and recovery procedure

1. Build an immutable application image from a reviewed commit and record its image digest.
   Run type checks, application tests, dependency audit, and container scan before promotion.
2. Back up the staging/production database to the approved encrypted destination. Record the
   backup identifier and verify that it is readable before changing the schema.
3. Review the migration SQL and compatibility with both the current and target application.
   Run `prisma migrate deploy` once as a release job using the target image and database
   secret; do not let every web replica race to apply migrations.
4. Start the new image with `APP_ENV=staging` or `production`, demo data disabled, invitation
   enforcement enabled, and a private HTTPS ingress. Run health checks and the synthetic
   signup → introduction → acceptance → chat → block journey; verify both accounts lose
   access after blocking and check moderator/report and account-deletion controls.
5. Promote only after the staging evidence, privacy/safety approvals, backup restore rehearsal,
   and operational ownership are recorded. Keep the prior image digest and the pre-release
   backup identifier.
6. To roll back, route traffic to the prior image only when the migration is backward
   compatible. Otherwise restore the pre-release database backup to a separate database,
   verify it, and switch the application connection to that restored database. Never delete
   or overwrite the only backup during recovery.
7. Record migration outcome, image digest, health checks, alerts, and any rollback decision.

Local Compose preserves data with `docker compose stop` or `docker compose down`; neither
command is a database backup. `docker compose down -v` deletes the named volume and is not a
recovery procedure.

### Local private-staging backup/restore rehearsal

The following PowerShell sequence demonstrates a custom-format backup and restore to a
separate database using the local staging Compose profile. It does not configure encrypted
off-host retention; that remains mandatory for an actual staging/production system.

```powershell
New-Item -ItemType Directory -Force .\private-backups | Out-Null
docker compose -p afroie-staging --env-file .env.staging exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/pre-release.dump'
docker compose -p afroie-staging --env-file .env.staging cp db:/tmp/pre-release.dump .\private-backups\pre-release.dump
docker compose -p afroie-staging --env-file .env.staging cp .\private-backups\pre-release.dump db:/tmp/pre-release.dump
docker compose -p afroie-staging --env-file .env.staging exec -T db sh -c 'createdb -U "$POSTGRES_USER" afroie_restore_check && pg_restore --no-owner -U "$POSTGRES_USER" -d afroie_restore_check /tmp/pre-release.dump'
docker compose -p afroie-staging --env-file .env.staging exec -T db sh -c 'psql -U "$POSTGRES_USER" -d afroie_restore_check -c "SELECT count(*) FROM \"User\""'
```

Verify the restored schema and expected synthetic records before treating the rehearsal as
passed. Keep the original database untouched. For rollback after a breaking migration,
restore into a new database and point the prior image at that database; do not overwrite the
only backup or assume a prior image is compatible with a changed schema.
