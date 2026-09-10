# Common Ground

A participatory budgeting web app built with Next.js, React, TypeScript and PostgreSQL, deployed with Docker.

## Main features

- Three phases: submit ideas, vote, and view results and personal impact.
- User accounts with district/category interests; projects include images, locations and estimated costs.
- **Cumulative voting is the default:** 100 coins per person, quadratic votes, and project funding through MES plus greedy completion.
- Admin controls for phases, project editing, moderation, feedback counts and delivery updates.
- Mobile and desktop voting, light/dark themes, achievements and personal impact PDF downloads.

The other voting methods—Yes / neutral / no, ranked, shared vote budget and Elo—are **old, unfinished prototypes**. They remain in the code but are not the supported voting flow.

See [Voting and results](VOTING.md) for the current rules and funding algorithm.

## Run locally

Requires Node.js 22.20+ and Docker Desktop.

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and configure the database, app origin, network interface and session secret.
3. Run `npm run dev:local` for development with live updates.
4. Run `npm run admin:create` to provision an administrator.

For Docker deployment, run `docker compose up --build -d` with the configured environment.

## Data and checks

- `db/schema.sql` creates a fresh database; startup preserves existing data.
- `npm run db:setup-dev` prepares the separate Zürich mock database: 50 fictional projects and a CHF 10,000 funding budget.
- Research simulations use separate data and containers.
- Keep environment files, credentials and local outputs out of version control.
- Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:mobile`. Integration tests require `TEST_DATABASE_URL`; browser tests require a running app.

## Code layout

- `src/client`: interface and interactions.
- `src/server`: authentication, database access, voting and results.
- `src/contracts`: shared data contracts.
- `src/app`: pages and API handlers.
