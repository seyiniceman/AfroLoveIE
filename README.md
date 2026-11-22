# AfroIE Meet

An original, local-first dating app pilot for adults in Ireland who are looking for a serious, cross-cultural relationship. The pilot starts in Dublin. Profiles use people’s own words; identity and cultural-background fields are optional.

## Run locally with Docker Compose

Requirements: Docker Desktop (or Docker Engine with Compose) and a browser.

```powershell
docker compose up --build
```

Open **http://localhost:3000**. Compose waits for PostgreSQL, applies the checked-in Prisma migration, loads fictional development demo accounts, then starts the web app. The database is stored in the named `postgres-data` volume.

To stop the app while preserving data:

```powershell
docker compose stop
```

To remove the containers and network but keep the database volume:

```powershell
docker compose down
```

Do not use `docker compose down -v` unless you intend to delete the database. Restart stopped containers with `docker compose start`; rebuild after code changes with `docker compose up --build`.

Compose has local-only fallback credentials so the startup command works without an `.env` file. To use explicit local values, copy `.env.example` to `.env`. The checked-in values are for local development only and must not be used outside this machine. Demo sign-in and seed data require `APP_ENV=development` and `DEMO_DATA_ENABLED=true`; the app rejects demo data, non-invited sign-up, weak session secrets, and non-HTTPS origins in staging/production configuration.

## Fictional demo accounts

Select **Continue as Amara**, **Continue as Daniel**, or **Continue as Moderator** on the sign-in page. Alternatively, sign in with:

| Account | Email | Password |
| --- | --- | --- |
| Amara | `amara@example.test` | `LocalOnly!2026` |
| Daniel | `daniel@example.test` | `LocalOnly!2026` |
| Moderator | `moderator@example.test` | `LocalOnly!2026` |

Other fictional profiles are seeded for discovery. These demo identities and credentials are available only when the local development seed is explicitly enabled.

## Try the complete introduction flow

1. Sign in as Amara. In **Discover**, find Daniel’s fictional profile and choose **Send an introduction** on his tradition prompt.
2. Sign out and sign in as Daniel. Open **Introductions**, then accept Amara’s note.
3. Open **Matches**. Both accounts now have one match and one conversation. Send a message from either account.
4. Accepting that same introduction again returns the existing match; it does not create another match or conversation.
5. To test blocking, switch back to Amara and block Daniel in **Matches** or **Discover**. Both accounts lose the match and can no longer send messages to one another; the profiles are excluded from each other’s discovery.
6. Submit a report using **Safety options** on a profile or chat. Sign in as the moderator and open **Reports** to review it.

The moderator queue is server-authorised; changing a client-side role or calling the queue as a member does not grant access.

## Local development without Docker

Use Node.js 22 or later. Start PostgreSQL and set `DATABASE_URL`, `SESSION_SECRET` (at least 32 characters), `APP_ENV=development`, and `DEMO_DATA_ENABLED=true`, then run:

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Run `npm run test` and `npm run typecheck` for the local configuration tests and TypeScript check. With the local Compose app running and demo seeding enabled, run `npm run test:integration` to create, exercise, and delete synthetic accounts while checking server-side permissions. For a production build, use `npm run build` and `npm start`; do not enable demo data in production.

In an invite-only environment, issue a one-use code from an operator shell with the app database configured: `npm run db:invite` (optional expiry in days, 1–365). The code is printed once and only its hash is stored; distribute it through an approved private channel.

## Private staging preparation

The repository includes a staging profile for a private, loopback-bound host; it is not an external deployment or a production service. Copy `.env.staging.example` to an untracked `.env.staging`, supply unique database credentials, a random session secret, and the exact HTTPS origin configured at your private reverse proxy. Generate example secrets with Node.js:

```powershell
node -e "const c=require('node:crypto'); console.log('SESSION_SECRET='+c.randomBytes(48).toString('base64url')); console.log('POSTGRES_PASSWORD='+c.randomBytes(32).toString('base64url'))"
```

With the private host and proxy already configured, build and run the migration explicitly before starting the app:

```powershell
docker compose -p afroie-staging --env-file .env.staging build
docker compose -p afroie-staging --env-file .env.staging run --rm app ./node_modules/.bin/prisma migrate deploy
docker compose -p afroie-staging --env-file .env.staging up -d
```

The staging app binds to `127.0.0.1:3000`, disables demo data, and requires invitation codes. The database is not published to the host. This local profile does not supply HTTPS ingress, email, managed backups, monitoring, or a managed database; those must be selected and tested before any real beta. See [docs/BETA-LAUNCH.md](./docs/BETA-LAUNCH.md) for staging inputs and release/restore/rollback procedures.

## Reference-informed requirements

These are high-level product patterns, not copied screens, copy, code, member data, branding, or APIs. We checked the official help-center articles listed below on 19 November 2026.

| Requirement | Source | Member action | Expected outcome in this pilot |
| --- | --- | --- | --- |
| Let people shape a useful profile with personal prompts. | [Hinge: edit prompts](https://help.hinge.co/hc/en-us/articles/36311352171539-How-do-I-edit-my-Prompts); [Badoo: standing out](https://support.badoo.com/hc/en-us/articles/33286091793949-Standing-out-on-Badoo) | Add their own bio, relationship intention, and prompt answers. | A member can share what matters in their own words; identity and culture are optional. |
| Make discovery about relevant profiles and preferences. | [Hinge: Discover Feed](https://help.hinge.co/hc/en-us/articles/36311592824595-Discover-Feed); [Badoo: Discover](https://support.badoo.com/hc/en-us/articles/32089604459933-Using-the-Discover-tab); [Badoo: Encounters](https://support.badoo.com/hc/en-us/articles/32089144062493-Using-the-Encounters-Tab) | Browse profiles based on broad location and relationship intent. | Show eligible fictional or member profiles; do not rank by ethnicity or exact location. |
| Put a personal note next to the profile detail that inspired it. | [Hinge: Likes](https://help.hinge.co/hc/en-us/articles/36311632894995-Likes); [Hinge: Discover Feed](https://help.hinge.co/hc/en-us/articles/36311592824595-Discover-Feed) | Send an introduction in response to a tradition or future prompt. | The recipient sees the note in an introductions inbox and can accept or decline. |
| Make acceptance a clear transition into a private conversation. | [Hinge: matching and chat](https://help.hinge.co/hc/en-us/articles/360011090134-How-Do-I-Match-with-Someone-and-Start-Chatting); [Badoo: conversations](https://support.badoo.com/hc/en-us/articles/32089915184797-Your-Conversations) | Accept an incoming introduction. | Both participants get one active match and one conversation; repeated acceptance is idempotent. |
| Provide direct, durable safety controls. | [Hinge: report someone](https://help.hinge.co/hc/en-us/articles/115004671227-How-do-I-report-someone); [Badoo: reporting someone](https://support.badoo.com/hc/en-us/articles/32093227469469-Reporting-someone); [Hinge: unmatching](https://help.hinge.co/hc/en-us/articles/36311673303571-Unmatching); [Badoo: unmatching](https://support.badoo.com/hc/en-us/articles/34368547917981-Unmatching-someone) | Report, block, or unmatch a member. | Reports go to an authorised moderator queue; blocks and unmatches close messaging and remove the connection. |
| Give members control over their stored account data. | [Hinge: delete account](https://help.hinge.co/hc/en-us/articles/115004020968-How-do-I-delete-my-account) | Confirm their password and request account deletion. | The account and its associated profile and relationship data are deleted. |

## Data, safety, and pilot boundaries

- Server routes enforce profile ownership, match participation, active-match messaging, block checks, report creation, and moderator-only report review.
- Passwords are hashed; browser sessions use an HTTP-only, same-site cookie signed with `SESSION_SECRET`.
- A block closes any active match and hides both profiles from each other. An unmatch permanently closes the conversation.
- Account deletion requires the current password and cascades through associated records.
- Broad city/area and relationship intention are used for discovery. The pilot does not collect precise location or biometric verification and does not use ethnicity-based ranking.
- Member photos can be uploaded as JPEG, PNG, or WebP files up to 2 MB each. Uploaded image data is stored in PostgreSQL with the profile and served through an access-checked endpoint; there is no separate media-storage service.
- This is a local pilot, not a production-ready dating service. Before public launch, add operational controls such as email verification, abuse/rate limiting, privacy/legal review, secure production secret management, backups, and a production media-storage policy.

For the invite-only beta launch gates, private staging inputs, and release/migration/backup/restore/rollback procedure, see [docs/BETA-LAUNCH.md](./docs/BETA-LAUNCH.md). No external deployment has been authorised or performed.

## Supplied image review

The workspace contained 23 portrait JPEGs (943 × 2048). Visual inspection showed dating-app UI screenshots, including competitor screens and member portraits, rather than standalone couple photographs approved for reuse. The originals were preserved at the workspace root and excluded from the Docker build; none are used as app assets or demo avatars.

| Original filename | App path | Placement |
| --- | --- | --- |
| No supplied image selected; the provided files are app screenshots, not suitable standalone couple photos. | — | — |
| Original project illustration (`couple-hero.svg`) | `public/images/couple-hero.svg` (`/images/couple-hero.svg`) | Landing-page hero, right side on desktop and below the headline/action on mobile. |

The hero is an original vector illustration, not a photograph. Its alt text describes the illustration. If you provide a couple photo you have permission to use, it can replace the illustration without changing the responsive layout.

## Project structure

- `app/` — Next.js landing page, member workspace, and JSON route handlers.
- `lib/` — database, session, and validation helpers.
- `prisma/schema.prisma` and `prisma/migrations/` — PostgreSQL data model and reproducible migration.
- `prisma/seed.ts` — local fictional demo accounts; refuses to run unless local development seeding is enabled.
- `public/images/couple-hero.svg` — original vector hero asset.
- `Dockerfile`, `compose.yaml`, `.dockerignore`, `.env.example` — local container setup.
