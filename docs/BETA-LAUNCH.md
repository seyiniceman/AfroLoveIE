# Invite-only beta launch readiness

This checklist is an evidence-backed release gate, not a declaration that the beta is
production-ready. “Verified” refers to the current code and local checks; staging evidence
and operational approvals are still required before launch.

## Prioritised checklist

| Priority | Launch item and pass condition | Status | Evidence / remaining work |
| --- | --- | --- | --- |
| P0 | Production and staging fail closed: required secrets and canonical HTTPS origin are validated at startup; demo credentials and seed paths cannot run outside development. | Already verified | Runtime-config tests passed; the isolated local staging Compose profile started with demo sign-in disabled, invitations required, and no demo seed data. This does not verify a hosted production environment. |
| P0 | Beta access is invite-only: an unexpired invitation can create exactly one account; missing, expired, and reused codes are rejected; invitation codes are stored hashed and issued only by an operator. | Already verified | On the isolated staging profile, missing, invalid, and expired codes were rejected; two concurrent redemptions of one issued code produced exactly one account and one rejection. Codes are hash-stored and issued with `node scripts/create-invitation.mjs` from the production runner (`npm run db:invite` in development). A real invite-distribution/email process remains an operator/service decision. |
| P0 | Session and account controls: production cookies are Secure, sessions expire and can be revoked on logout, unsafe browser requests are same-origin, and passwords meet a documented minimum. | Already verified | The staging profile emitted Secure/HttpOnly cookies; integration checks covered same-origin rejection, logout revocation, password-protected account deletion, and invalidation after deletion. |
| P0 | Profile privacy and media: members can edit only their own profile; profile images are stored locally, content-checked, and served only to the owner or a currently eligible member; blocked people cannot retrieve them. | Already verified | Synthetic integration checks covered profile ownership, URL-photo rejection, authorized photo access, and media denial after blocking. Production object storage and scanning remain separate operational requirements. |
| P0 | Relationship access controls: only eligible members can discover profiles or send introductions; only an introduction recipient can answer; only active, unblocked match participants can read or send messages; duplicate acceptance creates one match and conversation. | Already verified | `npm run test:integration` passed. A separate staging API check repeated acceptance twice, retained one match and conversation, and verified that after a block neither member can list or read the match, send a message, or discover the other. |
| P0 | Safety and moderation: members can submit reports, but only moderators can view or update them; block/unmatch stop access; account deletion requires the account password and removes associated data. | Already verified | Staging API checks created an OPEN report, received HTTP 403 for a member queue request, then confirmed the report was visible to a temporarily role-authorised synthetic moderator. The synthetic moderator role was restored. The local integration suite covers account deletion and unmatching. |
| P0 | Release images: the application runner image has no critical/high findings, each local supporting image has an explicit disposition, and every image used by hosted staging is scanned. | Dependent on external service or human decision | Trivy found 0 critical/high issues in `afroie-meet:local-20261122-2348` (image ID `sha256:88c40b33c62723517e3e2df4115e002cd3484d9fd887be42e1c6b0cd96fd2e1b`). Compose pins Caddy 2.11.9 to `sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0`; it has 0 critical and 2 high findings (`CVE-2026-116587`, `CVE-2026-78661`). The running local PostgreSQL image (`sha256:1d5b02d3a9941fbd52437db4107f8c52d6297dac553ca1e5c299ebb3756b4857`) has 1 critical and 26 high findings, including `CVE-2025-68121` in the embedded `gosu` standard library and `CVE-2026-86144` in `libxml2`. The old Caddy 2.10 image had 6 critical and 100 high findings. Keep these loopback-only supporting images private; do not promote them. A hosted ingress/database has not been selected and must be scanned before staging. |
| P0 | Local release and restore rehearsal: build a named image, apply migrations as an explicit release step, verify fail-closed runtime flags, and restore a backup into an isolated database with profiles, matches, and reports intact. | Already verified | `release-staging.ps1` built `local-20261122-2348`, ran `prisma migrate deploy` before app start, and verified health, `demoAvailable=false`, and `inviteRequired=true`. A custom-format database backup restored to a separate database and preserved both synthetic profiles, one match, and one report. |
| P0 | Private hosted staging is isolated from public traffic and real member data; the deployed image, trusted HTTPS origin, secrets, invite flow, backup, and rollback are verified with synthetic accounts. | Dependent on external service or human decision | Only loopback local staging exists. Caddy's internal certificate was untrusted by default; the isolated Edge browser ignored that warning, so this is not trusted-certificate or ingress evidence. No hosted provider, private ingress, DNS, managed database, secret store, or external backup destination is configured. |
| P0 | Operational recovery and rollback: a named release is backed up; migrations are reviewed and applied once; restore and rollback to a compatible previous image/schema are demonstrated. | Dependent on external service or human decision | Local backup/restore is rehearsed and release/migration steps are scripted. No previous hosted image or compatible schema transition exists to exercise a real rollback; the off-host encrypted backup and recovery path require an approved provider and operator rehearsal. |
| P1 | Health alerts: a failed check reaches a connected webhook and the named on-call operator receives and acknowledges it. | Dependent on external service or human decision | A local receiver accepted the failure alert with HTTP 204 and the expected payload. No monitoring endpoint, recipient, on-call rota, or human acknowledgement is configured. |
| P1 | Email ownership and recovery: invitees verify an email address before discovery, can recover access, and moderator accounts use MFA. | Dependent on external service or human decision | Requires an email-delivery provider, verified sender/domain, recovery policy, and moderator MFA decision. These controls are not represented as complete by this local implementation. |
| P1 | Abuse controls: login, signup, introductions, chat, uploads, and reports have measured rate limits and alerts that remain effective across replicas. | Dependent on external service or human decision | No distributed rate limiter, edge/WAF, alerting, or abuse-response operation is configured. Select and test these controls in staging. |
| P1 | Moderator staffing and abuse handling: named moderators have approved training, coverage hours, escalation thresholds, report SLAs, and an incident path for threats or repeat abuse. | Dependent on external service or human decision | The application provides a role-protected report queue, but no real moderators, rota, service levels, escalation policy, or support contact have been approved. |
| P1 | Media operations: production photos use private object storage, malware/content scanning, retention rules, and tested deletion; no user media is copied into public assets. | Dependent on external service or human decision | The pilot stores uploaded photos in PostgreSQL. Local access controls can be tested, but production storage, scanning, retention, and deletion require provider configuration and an approved policy. |
| P1 | Privacy and legal review: approve the privacy notice, consent/community terms, retention/deletion rules, lawful basis, DPIA assessment, and an incident/contact process for an Ireland beta. | Dependent on external service or human decision | Requires a designated human owner and appropriate legal/privacy review before real members are invited. |
| P1 | Operational readiness: named on-call owner, health/latency/error alerts, database capacity, encrypted backups, restore evidence, and incident runbook are accepted. | Dependent on external service or human decision | No hosting, monitoring, paging, or backup destination is configured. |
| P2 | Accessibility and product review: keyboard and screen-reader journeys, contrast, consent copy, and responsive layouts are reviewed at supported breakpoints. | Dependent on external service or human decision | A complete accessibility review has not been run; a named product/QA owner must approve the supported journeys and results. |

## Current release candidate disposition (2026-11-23)

**Status: BLOCKED — no hosted release candidate has been built or deployed.** The repository
contains no identified provider configuration, and the hosting account, region, hostname,
database service, email sender, and alert recipient have not been selected. No external
deployment or billable resource has been created. Public beta registration remains closed;
the local development server used below deliberately reports `inviteRequired=false` and must
not be exposed as staging or production.

- Current source is branch `main` at commit
  `a664d6385d427d7cf0505389d6e255892d9c9961`, with uncommitted and untracked changes.
  The commit alone does not identify a reproducible release artifact, and no commit was
  created for this candidate.
- On 2026-11-23, Docker Desktop's Linux engine recovered after its update. A fresh
  production build from the working tree succeeded in Docker. The development app
  container runs `afroie-meet:local`
  (`sha256:8b282beace8e58df9f58913288445721f6b264d07e62aa4c2e0e1bb9a570cd85`).
  The app and existing PostgreSQL container were healthy. Only the app container
  was recreated, and the database volume was preserved. This image is local build
  evidence. A hosted release candidate and its image scan remain pending.
- Earlier on 2026-11-23, `npm.cmd test` passed 7/7 and typecheck passed, but the
  integration run against the old container failed at `message.sender.id`.
  After the rebuild, `npm.cmd run test:integration` exited 0. It verified the
  sender ID, duplicate acceptance, chat and media permissions, moderation,
  unmatching, blocking, logout and account deletion.
- The browser check was against `http://localhost:3000` in **development**, where
  `/api/auth` reported `demoAvailable=true` and `inviteRequired=false`. Two fresh fictional
  accounts saved profiles, exchanged an introduction, accepted it, repeated acceptance
  without creating another match, and persisted a chat message. Sending the message caused a
  client error because its response lacked `sender`; after reload the saved message appeared.
  The first report attempt failed with `ERR_CONNECTION_RESET`; after reopening the page, report
  submission succeeded and showed the success message. Moderator visibility and blocking were
  not verified in this browser run. This is not invite-only staging evidence.
- The 2026-11-23 recheck only loaded the existing local development signup page; no fresh
  browser journey was run against the rebuilt app.
- The REA browser scenario failed before any user-flow action with `execution_failure` and an
  incomplete-cleanup warning. It produced no journey evidence. The integrated browser
  completed the local signup/profile/introduction/match/chat/report steps, but the page target
  became unavailable before blocking could be completed. The separate browser-debug fallback
  could not launch because its Playwright Chromium executable is absent; no browser download
  was attempted.
- A follow-up authenticated API check for moderator visibility and two-sided blocking also
  lost its local connection before completion. All fresh API-test accounts were successfully
  deleted afterward. No pass is claimed for those checks in this round.
- Source search found no account-recovery or password-reset flow. Email-based recovery,
  delivery, and verification cannot be claimed until that functionality is implemented and
  tested with a chosen sender.

### Decisions and owners required before private staging

| Gate | Exact input or acceptance evidence | Owner |
| --- | --- | --- |
| Hosting account and region | Select the provider, account/subscription, Ireland region, approved budget, and private-ingress mechanism (VPN/SSO or explicit IP allow-list). | User/account owner to choose; platform operator to configure. |
| Hostname and trusted HTTPS | Provide an owned staging hostname/domain and DNS control; configure a publicly trusted certificate while keeping the app private; verify the certificate without bypass flags. | User/domain owner to provide; platform operator to configure and test. |
| PostgreSQL release target | Prefer a provider-managed PostgreSQL 16 service unless a self-managed deployment is chosen. Confirm the exact major/minor service version, TLS/network policy, who applies security patches and when, maintenance window, encryption, backup retention/PITR, and isolated restore procedure. For self-managed PostgreSQL, provide the exact candidate image digest for scan, migration rehearsal, and restore rehearsal. | User/account owner to choose; named database operator to verify. |
| App and ingress images | Build from a reviewed, clean source revision; record immutable app and ingress image digests; scan those exact images and dispose of all critical/high findings before promotion. | Release owner to approve; platform operator to provide the target ingress. |
| Email sender and recovery | Choose the email service, verified sender domain/from address, credentials in the host secret manager, recovery/verification policy, and approved templates. Implement and verify recovery delivery; no credentials belong in Git. | User to select service/sender; product/engineering owner to implement; email operator to verify delivery. |
| Alert recipient | Provide a monitoring webhook secret, named primary responder, backup/escalation contact, and on-call rota; verify a test alert and record human acknowledgement. | User/operations owner to name responders; on-call lead to acknowledge. |
| Backup and rollback | Identify the encrypted off-host backup destination and retention, restore target, prior image digest, schema compatibility plan, and operator who rehearses restore and rollback. | Named database and release operators; user to appoint them. |
| Accessibility | Complete keyboard-only and screen-reader journeys, contrast checks, consent-copy review, and responsive checks at agreed breakpoints. | Named product/QA owner; not yet assigned. |
| Privacy review | Approve the Ireland beta privacy notice, consent/community terms, retention/deletion rules, lawful basis/DPIA assessment, and incident contact. | Named privacy lead or counsel; not yet assigned. |
| Moderator and abuse coverage | Name moderators, cover hours, report SLA, training, threat/repeat-abuse escalation, and member support contact. | Named moderation lead; not yet assigned. |

Keep real-member invitations closed until the hosted private-access, trusted HTTPS, recovery,
database/backup, rollback, alert-acknowledgement, accessibility, privacy, and moderation gates
are all evidenced and approved.

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
through access-controlled endpoints. In the 2026-11-22 local staging browser run, REA observed
two synthetic invite signups, both profile saves, Daniel's tradition prompt in Amara's
discovery, Amara's introduction in Daniel's inbox, and the match card with Daniel's chat
message. The browser
captured `Secure`, `HttpOnly`, `SameSite=Lax` session cookies. The long REA sequence timed out
while opening the chat panel; acceptance and the persisted message were independently
confirmed by staging API/database checks. Report creation, member denial, moderator visibility,
duplicate acceptance, and the two-sided block were verified through staging API calls, not
claimed as REA observations.

## Previous local verification record (2026-11-22)

- Runtime-config tests, TypeScript check, production build, and `npm audit --audit-level=high`
  passed; the audit reported zero known vulnerabilities.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\release-staging.ps1 -ReleaseTag local-20261122-2348`
  built the application runner image, ran `prisma migrate deploy` before app startup, and
  verified health, `demoAvailable=false`, and `inviteRequired=true`. The application image ID
  was `sha256:88c40b33c62723517e3e2df4115e002cd3484d9fd887be42e1c6b0cd96fd2e1b`.
- Docker Compose built and started the development app and PostgreSQL; migrations applied and
  the health endpoint returned `{"status":"ok"}`.
- A separate loopback-only staging Compose project migrated a fresh database and passed
  health, demo-disabled/invite-required, missing/invalid/expired invitation, concurrent
  one-time redemption, Secure/HttpOnly cookie, profile access, and account-deletion checks.
  For that rehearsal, the isolated staging containers and database volume remained local and
  contain only synthetic accounts; temporary browser credentials were not added to Git.
- `npm run test:integration` passed synthetic checks for profile ownership, origin enforcement,
  photo access, recipient-only acceptance, duplicate acceptance, nonparticipant messaging,
  moderator-only report read/update, unmatching, blocking, logout revocation, and
  password-protected account deletion.
- Staging API checks confirmed exactly one match/conversation after repeated acceptance, an
  OPEN report, member HTTP 403 on `/api/moderation`, moderator visibility, and HTTP 403 for
  message reads/writes from both accounts after blocking. Both accounts also lost discovery
  visibility of the other.
- A custom-format backup was restored into a separate database; it preserved 2 synthetic
  profiles, 1 match (`UNMATCHED` after the block), 1 OPEN report, and the synthetic account
  names. The source database was not modified by restore.
- The staging app container was restarted after the report/block journey; `/api/health` stayed
  healthy, `/api/auth` still reported demo sign-in disabled and invitations required, and the
  source database retained 2 synthetic profiles, 1 match, and 1 report.
- Trivy: the application runner image had 0 critical and 0 high findings. After replacing the
  old local proxy image, Caddy 2.11.9 had 0 critical and 2 high findings; it remains a
  loopback-only test proxy and is not approved for a hosted environment. The exact running
  PostgreSQL image had 1 critical and 26 high findings; it is bound only to the Compose
  network and must not be promoted or publicly exposed.
- The image scans used:

  ```powershell
  trivy image --quiet --scanners vuln --severity CRITICAL,HIGH --format json --output .\app-scan.json afroie-meet:local-20261122-2348
  trivy image --quiet --scanners vuln --severity CRITICAL,HIGH --format json --output .\caddy-scan.json caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0
  trivy image --quiet --scanners vuln --severity CRITICAL,HIGH --format json --output .\postgres-scan.json sha256:1d5b02d3a9941fbd52437db4107f8c52d6297dac553ca1e5c299ebb3756b4857
  ```

  The Caddy container was recreated from its pinned image. The hosted release should use a
  provider-managed database rather than promote this local PostgreSQL image.
- The health-alert helper sent a real local webhook request to a temporary receiver; it
  returned HTTP 204 with the expected failure payload. This does not verify delivery to a
  human operator.
- REA observed the invite/signup, profile, discovery, introduction, inbox, match-card/chat
  summary, and HTTPS cookie attributes. After the server-side block check, each account's
  browser session showed an empty discovery list. The browser tool timed out opening the chat
  panel, so a complete transcript view and browser-driven block sequence were not captured;
  server checks independently verified chat persistence and two-sided block enforcement.
- Still unverified: a hosted staging deployment and trusted HTTPS ingress, external invite and
  recovery email, external backup/restore and image rollback, human alert acknowledgement,
  moderator staffing and abuse response, and full accessibility/privacy/legal review.

The initial npm audit found a high-severity ReDoS advisory in Prisma’s transitive `effect`
dependency (`CVE-2026-121707`); an npm override now resolves `effect@3.22.1`, and a fresh
`npm audit` reports zero vulnerabilities. The app runner image scan is clean for critical/high
findings. The loopback-only Caddy and PostgreSQL images still contain high/critical findings;
no hosted ingress or database image/service has been selected or scanned.

## Staging inputs still required

Before any external staging deployment, an operator must provide:

- Hosting provider, Ireland region, account/subscription and budget approval; a private access
  method; an owned staging hostname and DNS control; and a named platform operator.
- A PostgreSQL target (managed PostgreSQL 16 recommended, or an exact self-managed image
  digest), operator/patch responsibility, TLS/network policy, maintenance window, backup
  retention/PITR, encrypted backup destination, and isolated restore access.
- A generated `SESSION_SECRET` of at least 64 random characters and the exact HTTPS
  `APP_ORIGIN`; secrets must be injected through the host’s secret manager, not committed.
- An invitation distribution process; an email provider, verified sender domain/from address,
  secret-managed API credentials, approved templates, recovery policy, and an owner to test
  delivery. Account recovery is not implemented yet.
- Monitoring/error-reporting destination, webhook secret, log-retention policy, named primary
  and backup alert recipients/on-call rota, plus an operator to acknowledge a test alert.
- Named owners for release approval, database operations, accessibility, Ireland privacy/legal
  review, moderation coverage, and abuse escalation.

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

### Local image rollback

Only use an image that was built and retained before the release. This switches the local app
container without rebuilding or rerunning migrations:

```powershell
$env:APP_IMAGE = "afroie-meet:<previous-release-tag>"
$env:APP_BUILD_TARGET = "runner"
docker compose --profile local-staging-https -p afroie-staging --env-file .env.staging up -d --no-build --no-deps --force-recreate app
```

Confirm the prior image digest, `/api/health`, and the invite-only/demo-disabled flags. This
procedure was documented but not exercised against a previous image/schema pair in this
round. If the migration is not backward-compatible, first restore the backup into a separate
database, verify it, then use the provider's secret/connection mechanism to point the prior
image at that restored database. Never point a prior image at a schema it cannot read.

### Health alert rehearsal

The local failure test used a temporary HTTP receiver bound to `127.0.0.1`; it returned 204
after receiving the expected alert payload. For a hosted environment, configure a real HTTPS
webhook and run the helper from the monitoring or scheduled-job context:

```powershell
$env:STAGING_HEALTH_URL = "https://<private-staging-host>/api/health"
$env:STAGING_ALERT_WEBHOOK_URL = "https://<monitoring-provider-webhook>"
node .\scripts\notify-staging-health.mjs
```

The helper returns a nonzero result when health is bad. The local receiver test does not prove
delivery to an operator; configure a named recipient/on-call rota, trigger an alert, and record
human acknowledgement before inviting real members.

### Local private-staging backup/restore rehearsal

The following PowerShell sequence demonstrates a custom-format backup and restore to a
separate database using the local staging Compose profile. The 2026-11-22 rehearsal completed
successfully: a 29,248-byte backup was copied out of the database container and restored into
`afroie_restore_20261122c`; the restored database retained two synthetic profiles, one match,
one report, and their expected statuses (`UNMATCHED`, `OPEN`). The original staging database
was left untouched. This does not configure encrypted off-host retention; that remains
mandatory for hosted staging.

```powershell
$backup = Join-Path $env:TEMP "afroie-pre-release.dump"
docker compose --profile local-staging-https -p afroie-staging --env-file .env.staging exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/pre-release.dump'
docker compose --profile local-staging-https -p afroie-staging --env-file .env.staging cp db:/tmp/pre-release.dump $backup
docker compose --profile local-staging-https -p afroie-staging --env-file .env.staging cp $backup db:/tmp/pre-release.dump
docker compose --profile local-staging-https -p afroie-staging --env-file .env.staging exec -T db sh -c 'createdb -U "$POSTGRES_USER" afroie_restore_check && pg_restore --no-owner -U "$POSTGRES_USER" -d afroie_restore_check /tmp/pre-release.dump'
docker compose --profile local-staging-https -p afroie-staging --env-file .env.staging exec -T db psql -U afroie_local_stage -d afroie_restore_check -c 'SELECT (SELECT count(*) FROM "Profile") AS profiles, (SELECT count(*) FROM "Match") AS matches, (SELECT count(*) FROM "Report") AS reports'
```

Verify the restored schema and expected synthetic records before treating the rehearsal as
passed. Remove only the temporary restore database and backup file after review. Keep the
original database untouched. For rollback after a breaking migration,
restore into a new database and point the prior image at that database; do not overwrite the
only backup or assume a prior image is compatible with a changed schema.
