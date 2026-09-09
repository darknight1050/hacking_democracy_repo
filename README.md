# Common Ground

A three-phase civic participation app built with **Next.js, React, TypeScript, and PostgreSQL**, deployed with Docker Compose. People submit district-based ideas with photos, vote on random subsets, and see the winning projects.

## Current development setup

- Public app: https://hackathon.skystate.ch
- Admin panel: https://hackathon.skystate.ch/admin (also linked in the public footer)
- LAN listener: http://192.168.1.104:3000
- Active database: `democracy_dev`, separate from the original `democracy` database.
- Sample dataset: 500 fictional ideas; 475 approved and 25 pending review, distributed across 12 districts. Each includes a remote photo URL and attribution from [Lorem Picsum](https://picsum.photos/) / Unsplash. Photos are illustrative, not depictions of the proposed projects. Internet access is needed to display them.
- Admin username: `admin`. The generated password is in `.local/admin-credentials.txt`, excluded from Git and Docker.

Start Docker Desktop and run `node scripts/dev-local.mjs` (or `npm run dev:local`) in this directory. PostgreSQL starts, migrations run, and Next.js Fast Refresh updates the browser when source files change. Ctrl+C stops a foreground server; `docker compose stop db` stops the database without deleting its data.

`.env` holds the active local configuration. `.env.before-dev` preserves the previous database configuration. Restore the previous `DATABASE_URL` and disable `DEV_TOOLS` to switch back; run migrations before restarting against that database. No original records were changed by the test setup.

For the reverse proxy, `APP_ORIGIN` is the browser-facing HTTPS URL and `DEV_HOST` is the local network interface. Restart after changing either. Caddy must forward `/api/*`, `/_next/*`, and WebSocket upgrades. Next.js allows the configured public hostname for development resources. Production builds can use `NEXT_OUTPUT_DIR=.next-build` to avoid changing the running development server's cache.

## Test the complete journey

1. Open **Admin login** and sign in using the local credential file.
2. Under **Review suggestions**, filter to **pending**, inspect a suggestion and its image, optionally add an internal note, and click **Approve**. Approved ideas appear publicly; new user submissions always enter the pending queue.
3. Under **Phase and voting settings**, select a voting method and subset size, choose **voting**, and save. At least two approved ideas are required. Voting settings lock when the first ballot is issued.
4. Open the public app's **Have your say** tab. Submit a ballot to receive another random subset. A browser refresh resumes its pending ballot.
5. In admin, set the phase to **results** and save. Public **See the impact** displays winners and the full ranking. The public app refreshes its event data every 15 seconds.
6. To test another method, use **Start another test run** in admin. Type `RESET VOTES`. This erases test ballots/scores and returns to suggestions, keeping ideas and moderation decisions. It is enabled only when `DEV_TOOLS=true` and the database is exactly `democracy_dev`.

**Moderation:** Hide removes an idea temporarily. Delete permanently erases its title, description, image and source attribution; only a tombstone ID remains for vote history. A confirmation is required in the panel. Hidden/deleted ideas never enter new ballots or published results. Removing an idea expires pending ballots that contain it, and voters can request a replacement. Historical votes and opponents' scores remain intact; moderation does not rewrite past preferences or Elo matches. The admin activity log records actions. Hidden ideas can be approved again; deleted ideas cannot be restored.

## Admin authentication

Accounts are provisioned only through the trusted local CLI; there is no public registration or default password. Passwords use salted scrypt hashes. Admin sessions use random tokens, stored as hashes in PostgreSQL, in HTTP-only SameSite cookies that expire after eight hours. HTTPS origins enable secure cookies. Logout and password rotation revoke sessions. Every admin API checks authentication; mutations also require the exact configured origin. Login attempts are limited globally to 20 per 15 minutes, independent of untrusted proxy headers.

```sh
npm run admin:create
# Rotate the password and revoke that admin's sessions:
npm run admin:create -- --reset
```

Optionally set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the local process environment before provisioning. Generated credentials are written to `.local/admin-credentials.txt`. Never commit or share that file publicly.

## Recreate the sample database

Requires Node.js 22.20+, dependencies installed, a valid `.env`, and PostgreSQL running.

```sh
npm ci
docker compose up db -d --wait
npm run db:setup-dev
node scripts/dev-local.mjs
```

The setup script creates `democracy_dev` if missing, applies versioned migrations, fetches photo metadata, seeds ideas idempotently, provisions admin, backs up `.env`, and switches the local database URL. It never deletes an existing database. Re-running the seed preserves edits/deletions to existing demo IDs and requires the suggestion phase. Sample votes are deliberately absent so testers can see their own impact.

## Docker deployment

1. Copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`).
2. Set a random `SESSION_SECRET` of at least 32 characters, a strong URL-safe `POSTGRES_PASSWORD`, and the public `APP_ORIGIN`. Keep local `DATABASE_URL` consistent with the password. Leave `DEV_TOOLS` disabled for normal deployments.
3. Run `docker compose up --build -d`.
4. Provision an administrator: `docker compose run --rm migrate node scripts/create-admin.mjs`. The generated credentials persist at `.local/admin-credentials.txt` through the administration container's bind mount. Alternatively use `npm run admin:create` locally when PostgreSQL is available on loopback.

The PostgreSQL volume persists across container restarts. `docker compose down` preserves it; `docker compose down -v` deletes it. Migrations run before the app starts. The app runs as a non-root user. PostgreSQL is published only on loopback for local administration. Place the app behind a TLS reverse proxy and back up PostgreSQL.

## Backend structure and extension points

`React event → API route → validation / authentication → service transaction → PostgreSQL`.

| Path                                 | Responsibility                                                       |
| ------------------------------------ | -------------------------------------------------------------------- |
| `src/components/civic-app.tsx`       | Public phase views, district filter, progressive idea display        |
| `src/components/suggestion-form.tsx` | Text / district / image submission                                   |
| `src/components/voting-panel.tsx`    | Method-specific controls and repeated voting                         |
| `src/components/admin-panel.tsx`     | Login, configuration, moderation, audit and test reset               |
| `src/app/api`                        | Explicit HTTP handlers and bounded input parsing                     |
| `src/lib/services.ts`                | Suggestion, ballot, vote and result transactions                     |
| `src/lib/admin-service.ts`           | Phase changes, moderation and development reset                      |
| `src/lib/admin-auth.ts`              | Login, session verification and logout                               |
| `src/lib/voting/selection.ts`        | Replaceable `SelectionStrategy` interface                            |
| `src/lib/voting/strategies.ts`       | Replaceable voting validation and aggregation strategies             |
| `db/migrations`                      | Versioned SQL schema with transaction/advisory-lock migration runner |

**Selection:** uniform cryptographic sampling without replacement within a ballot, from approved projects only. Different ballots can repeat projects or whole subsets. The selection interface receives candidates, subset size, and participant ID, so weighting or participant-aware selection can be added independently of voting aggregation.

**Methods:** ranked uses normalized Borda points `(N-rank)/(N-1)`; approval records explicit yes/no; budget distributes exactly the configured integer total; Elo compares two projects using initial rating 1000 and K=32. To add a method, extend the method union, schema constraint, registry, admin select and voting controls. The subset sampler remains unchanged.

**Results:** non-Elo methods rank by mean points per appearance, displayed as support percentage, to compensate for unequal random exposure. Elo ranks by rating. Unvoted and non-approved projects are excluded. Equal scores share a dense rank; all projects within the configured top distinct ranks win, so ties can produce extra winners. Appearance counts show sample size.

**Integrity:** ballots are server-owned, browser-bound and expire after one hour. Submitted projects must match the issued subset exactly. Votes, aggregates and ballot completion commit atomically; duplicate submissions are idempotent. Stable score-row lock ordering protects concurrent Elo updates. Event locks serialize phase/moderation changes with participation.

| API                                  | Purpose                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `GET /api/overview`                  | Phase, districts, up to 1,000 approved ideas, counts; scores only in results |
| `POST /api/suggestions`              | Multipart title, description, districtId and optional image                  |
| `GET /api/suggestions/:id/image`     | Approved image, or admin-only preview of a pending/hidden image              |
| `POST /api/ballots/next`             | Create/resume a random ballot                                                |
| `POST /api/votes`                    | `{ ballotId, entries: [{ suggestionId, value }] }`                           |
| `GET/POST/DELETE /api/admin/session` | Verify session / log in / log out                                            |
| `GET /api/admin`                     | Paginated, searchable moderation data and activity                           |
| `PATCH /api/admin/event`             | Set phase and voting configuration                                           |
| `PATCH /api/admin/suggestions/:id`   | Approve, hide or delete with an internal note                                |
| `POST /api/admin/reset`              | Guarded development-only vote reset                                          |
| `GET /api/health`                    | Database health                                                              |

Uploads are capped at 5 MB and 24 million pixels, re-encoded to WebP, stripped of metadata and resized to at most 1400 × 1400. Real uploads persist in PostgreSQL. Demo photo URLs are only set by the trusted seed script. Public upload requests cannot supply arbitrary remote URLs. Image responses use no-store so newly moderated images are checked again.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Set `TEST_DATABASE_URL` to the development database, then run `npm run test:integration`. On PowerShell, load it without printing credentials:

```powershell
node --env-file=.env -e "process.env.TEST_DATABASE_URL=process.env.DATABASE_URL;const r=require('child_process').spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','--test','tests/database.integration.ts','tests/http.integration.ts'],{stdio:'inherit',env:process.env});process.exit(r.status??1)"
```

Tests create and drop random isolated schemas. The HTTP suite starts a separate app on port 3001 with `.next-test` output; it does not modify the sample dataset. Coverage includes auth/CSRF, upload and approval, all four vote methods, exact membership, ownership, duplicate/concurrent submission, moderation and ballot expiry, results, deletion, reset and logout. Without the database URL, integration tests are explicitly skipped.

## Scope

This is a single-event prototype. Voters have anonymous browser identities, not verified residency or one-person-one-vote authentication; repeated ballots are intentional. Admin authentication does not change that participation model. Clearing cookies creates another voter identity. Suggestion submissions are capped at ten per browser per hour. Add verified voter identity and deployment-wide abuse controls before using this for a binding public election.
