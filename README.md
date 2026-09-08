# Common Ground

A three-phase civic participation app built with **Next.js, React, TypeScript, and PostgreSQL**, deployed with Docker Compose. People propose district-based ideas with optional photos, vote on random subsets, and see the winning projects.

## Run with Docker

1. Copy `.env.example` to `.env`.
2. Set `SESSION_SECRET` to a random string of at least 32 characters. Change `POSTGRES_PASSWORD`; use URL-safe characters because it is included in the database URL. Keep `DATABASE_URL` in sync for local commands.
3. Start Docker Desktop, then run:

```sh
docker compose up --build -d
```

Open http://localhost:3000. PostgreSQL data, including uploaded photos, persists in the `postgres_data` volume. Database migrations run before the app starts. `docker compose down` keeps this data; `docker compose down -v` deletes it.

Optional demo ideas (only works with an empty event):

```sh
docker compose run --rm migrate node scripts/seed.mjs
```

Move the event through its phases:

```sh
docker compose run --rm migrate node scripts/configure.mjs voting ranked
docker compose run --rm migrate node scripts/configure.mjs results
```

Choose `ranked`, `approval`, `budget`, or `elo` when opening voting. Phases only move forward. The method cannot change after the first ballot is issued. At least two ideas are required. Configuration is a trusted administrator CLI, never a public web endpoint. The landing view follows the current phase on a fresh visit; the three tabs remain available to explain past/upcoming phases.

## Local development

When using a reverse proxy, set `APP_ORIGIN` to the browser-facing URL and `DEV_HOST` to the local interface (this PC: `192.168.1.104`). Restart the dev server after changing these values. The public hostname is also allowed for Next.js development assets and live-update WebSockets. The proxy should forward all paths, including `/api/*` and `/_next/*`, and support WebSocket upgrades.

For this PC, with `.env` configured and Docker Desktop running, use `npm run dev:local` (or `node scripts/dev-local.mjs`). This starts PostgreSQL, applies migrations, and serves the app at http://localhost:3000 with Next.js Fast Refresh. Saved React, TypeScript, and CSS changes appear automatically. Stop the foreground server with Ctrl+C; the database stays running and retains its data. Run `docker compose stop db` when you also want to stop PostgreSQL. Dependency changes require installing packages and restarting the server; schema changes require running migrations.

Requires Node.js 22.20+ and PostgreSQL 17 (or use the database from Compose).

```sh
cp .env.example .env
npm ci
docker compose up db -d
npm run db:migrate
npm run db:seed
npm run dev
```

On PowerShell, use `Copy-Item .env.example .env`. If the machine's `npm.ps1` is broken, invoke the `npm.cmd` shipped alongside Node.js directly.

```sh
npm run db:configure -- voting ranked
npm run db:configure -- results
npm test
npm run typecheck
npm run lint
npm run build
```

## Request flow and code map

`React interaction → explicit API route → validation/session → service transaction → PostgreSQL`.

| Path                           | Responsibility                                                          |
| ------------------------------ | ----------------------------------------------------------------------- |
| `src/components/civic-app.tsx` | Suggestion form, voting controls, results, loading/error/success states |
| `src/app/api/*/route.ts`       | Small HTTP handlers with input parsing and consistent errors            |
| `src/lib/services.ts`          | Phase rules, ballot lifecycle, transactions, result queries             |
| `src/lib/voting/selection.ts`  | Replaceable subset selection interface                                  |
| `src/lib/voting/strategies.ts` | Validation and aggregation for each voting method                       |
| `src/lib/session.ts`           | Signed, HTTP-only anonymous browser identity                            |
| `src/lib/db.ts`                | Connection pool and transaction helper                                  |
| `db/migrations`                | Versioned SQL schema, applied transactionally with an advisory lock     |
| `scripts/configure.mjs`        | Trusted phase/method administration                                     |

| Endpoint                         | Event / response                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /api/overview`              | Event, districts, latest 100 ideas, participation counts; scores only after voting closes |
| `POST /api/suggestions`          | Multipart `title`, `description`, `districtId`, optional `image`; returns suggestion ID   |
| `GET /api/suggestions/:id/image` | Validated, re-encoded WebP image                                                          |
| `POST /api/ballots/next`         | Creates or resumes a browser-owned pending ballot                                         |
| `POST /api/votes`                | JSON `{ ballotId, entries: [{ suggestionId, value }] }`                                   |
| `GET /api/health`                | Database-backed health check                                                              |

All mutation requests must send an `Origin` matching `APP_ORIGIN`. Invalid requests return `{ "error": "…" }` with an appropriate HTTP status. SQL queries are parameterized. Files are capped at 5 MB and 24 million decoded pixels, resized to at most 1400 × 1400 and re-encoded to WebP (stripping metadata). Images are stored in PostgreSQL for straightforward transactional persistence; a future object-storage adapter can replace this for larger installations.

## Voting rules and extension points

- **Selection:** cryptographically random, uniform sampling without replacement within a ballot. No weighting, district filtering, or unseen-project prioritization is applied. Across ballots, repeats (including an identical set) are possible by design. Replace `selectionStrategy` with an implementation of `SelectionStrategy` to introduce weighting; participant ID is already part of its context.
- **Ranked (default):** rank every project from 1 to N. Normalized Borda points are `(N - rank) / (N - 1)`.
- **Approval:** explicitly choose yes (1) or no (0) for every project.
- **Budget:** allocate exactly the ballot's budget (10 by default) in non-negative integers. Points are each project's fraction of the budget.
- **Elo:** choose one winner from exactly two projects. Ratings start at 1000 with K = 32.
- **Results:** non-Elo methods use mean points per appearance (displayed as a percentage), not total points, to compensate for unequal random exposure. Elo uses final rating. Unvoted projects are excluded. Equal scores share a dense rank; all projects within the top `winner_count` distinct ranks (3 by default) win, so ties can produce more than three winners. Appearance counts remain visible; small samples can still be noisy.
- **Integrity:** ballots are server-issued, owned by the browser, expire after one hour, and require exactly their assigned projects. Repeated submissions are idempotent. Pending ballots are reused across refreshes/tabs. Votes, aggregate updates, and ballot completion are committed atomically. Score rows lock in stable order to avoid concurrent Elo lost updates. Phase transitions lock the event row and wait for in-flight participation transactions.

To add a method: extend the TypeScript `Method` union, database check constraint, strategy registry, configuration CLI, and corresponding voting controls. Keep selection independent of aggregation. `event` stores subset size, budget, and winner count; configure these before participation begins. Districts are initially Zürich's 12 numbered districts and can be replaced before ideas are submitted.

## Scope and deployment notes

This is a **single-event hackathon implementation**, not a verified election system. Browser identities permit repeated voting as requested; clearing cookies or switching devices creates a new identity. There is no verified residency, login, one-person-one-vote enforcement, moderation, or image-content review. Add those before running a binding public vote. Suggestion submissions are limited to ten per browser per hour; a reverse proxy should provide deployment-wide abuse and request-rate controls.

For deployment, set `APP_ORIGIN` to the exact public HTTPS origin and place the app behind a TLS reverse proxy. Secure cookies activate for HTTPS origins. Keep secrets out of Git, back up PostgreSQL, and restrict database access. The app container runs as a non-root user. Docker Compose publishes PostgreSQL only on loopback for local administration. A new event currently requires a separate database; multi-event support is an intentional future extension.

Tests cover selection invariants, membership tampering, ranking validation, allocation limits, approval values, and Elo arithmetic. Build, lint, and type checks are separate scripts. Run `npm run format` to format source files.

To run the PostgreSQL integration test, set `TEST_DATABASE_URL` to a running PostgreSQL database (PowerShell: `$env:TEST_DATABASE_URL = 'postgresql://democracy:democracy_local@localhost:5432/democracy'`), then run `npm run test:integration`. It creates and removes a random isolated schema and requires schema-creation permission. It tests ownership, concurrent duplicate submissions, expiry, results, and phase enforcement. With no URL, the integration test is explicitly skipped.
