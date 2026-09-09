# Common Ground

A three-phase civic participation app built with **Next.js, React, TypeScript, and PostgreSQL**, deployed with Docker Compose. People submit district-based ideas with photos, vote on random subsets, and see the winning projects.

## Current development setup

- Public app: https://hackathon.skystate.ch
- Admin panel: https://hackathon.skystate.ch/admin (also linked in the public footer)
- LAN listener: http://192.168.1.104:3000
- Active database: `democracy_dev`, separate from the original `democracy` database.
- Sample dataset: 500 fictional Hunger Games / Panem ideas across 12 industry-themed districts plus City-wide, with matching Wikimedia photos and attribution. District industries follow [Scholastic's district guide](https://www.scholastic.com/content/dam/scholastic/kids/pdf/SOTR_Digital%20Activities.pdf). Photos are illustrative and need internet access. Existing moderation decisions are retained when retheming.
- Admin username: `admin`. The generated password is in `.local/admin-credentials.txt`, excluded from Git and Docker.

Start Docker Desktop and run `node scripts/dev-local.mjs` (or `npm run dev:local`) in this directory. PostgreSQL starts, migrations run, and Next.js Fast Refresh updates the browser when source files change. Ctrl+C stops a foreground server; `docker compose stop db` stops the database without deleting its data.

`.env` holds the active local configuration. `.env.before-dev` preserves the previous database configuration. Restore the previous `DATABASE_URL` and disable `DEV_TOOLS` to switch back; run migrations before restarting against that database. No original records were changed by the test setup.

For the reverse proxy, `APP_ORIGIN` is the browser-facing HTTPS URL and `DEV_HOST` is the local network interface. Restart after changing either. Caddy must forward `/api/*`, `/_next/*`, and WebSocket upgrades. Next.js allows the configured public hostname for development resources. Production builds can use `NEXT_OUTPUT_DIR=.next-build` to avoid changing the running development server's cache.

## Test the complete journey

Browse published ideas without signing in. Use **Sign in / Sign up** to create a username/password account before voting or submitting. On first sign-in, choose your districts. **City-wide** is checked permanently and may be used when submitting ideas that affect multiple/all districts. District and category preferences are stored in PostgreSQL on the account and follow it across devices. **Change interests** reopens the district/category picker, and saving replaces any pending ballot that used different preferences.

Every idea needs **1–3 categories**, selected when submitting and editable in the admin moderation card. The database enforces the count and category references. Existing suggestions were backfilled with Community; the Panem mock ideas have theme-appropriate categories.

Districts have names only; categories belong to individual suggestions. On phones, the district picker, navigation, forms and voting controls use compact layouts and large touch targets.

**Select all districts** and **Unselect all districts** make bulk changes; City-wide stays checked. The same screen offers optional category interests (any number). These preferences are separate from a suggestion's required 1–3 tags and are saved on the account. Swipe, button and arrow-key answers share a 280 ms exit animation before advancing, with a shorter reduced-motion variant. No feedback is on the card's right edge for a left swipe.

The default test voting method is **Yes / neutral / no**. Each response counts as **one vote** in the results and telemetry. Support aggregation gives yes 1 point, neutral 0.5 and no 0. Sampling uses separate view counts and never the answer's support score. Ranked, budget and Elo remain available as separate strategies.

This method presents one project at a time. Swipe its photo **right for Yes**, **up for Neutral**, or **left for No**, use the matching **arrow keys**, or use the buttons. Held keys and modified shortcuts are ignored, as are keys while editing fields or reviewing answers. The rest of the page scrolls normally. Review and edit your answers before submitting the subset; gestures and keys do not submit votes automatically. Gesture thresholds are isolated in `src/client/voting/swipe.ts`, and the card flow is in `src/client/components/approval-deck.tsx`.

1. Open **Admin login** and sign in using the local credential file.
2. Under **Review suggestions**, filter to **pending**, inspect a suggestion and its image, optionally add an internal note, and click **Approve**. Approved ideas appear publicly; new user submissions enter the pending queue unless **Automatically approve new suggestions** is enabled. This switch affects future submissions only.
3. Under **Phase and voting settings**, select a voting method and subset size, choose **voting**, and save. At least two approved ideas are required. Voting settings lock when the first ballot is issued.
4. Open the public app's **Have your say** tab. Submit a ballot to receive another random subset. Signing in on another device or refreshing resumes the account’s pending ballot.
5. In admin, set the phase to **results** and save. Public **See the impact** displays winners and the full ranking. The public app refreshes its event data every 15 seconds.
6. To test another method, use **Start another test run** in admin. Type `RESET VOTES`. This erases test ballots/scores and returns to suggestions, keeping ideas and moderation decisions. It is enabled only when `DEV_TOOLS=true` and the database is exactly `democracy_dev`.

**Moderation:** Hide removes an idea temporarily. Delete permanently erases its title, description, image and source attribution; only a tombstone ID remains for vote history. A confirmation is required in the panel. Hidden/deleted ideas never enter new ballots or published results. Removing an idea expires pending ballots that contain it, and voters can request a replacement. Historical votes and opponents' scores remain intact; moderation does not rewrite past preferences or Elo matches. The admin activity log records actions. Hidden ideas can be approved again; deleted ideas cannot be restored.

## Admin authentication

Admin accounts are provisioned only through the trusted local CLI; there is no public registration or default password. Passwords use salted scrypt hashes. Admin sessions use random tokens, stored as hashes in PostgreSQL, in HTTP-only SameSite cookies that expire after eight hours. HTTPS origins enable secure cookies. Logout and password rotation revoke sessions. Every admin API checks authentication; mutations also require the exact configured origin. Login attempts are limited globally to 20 per 15 minutes, independent of untrusted proxy headers.

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

The setup script creates `democracy_dev` if missing, applies versioned migrations, seeds the Panem ideas from checked-in photo metadata, provisions admin, backs up `.env`, and switches the local database URL. It never deletes an existing database. Existing mock ideas are skipped on repeat setup. Sample votes are deliberately absent so testers can see their own impact.

The 500 mock suggestions use original fan-parody text from `db/fixtures/panem-memes.mjs`: district-specific story references such as Finnick's sugar cubes, Beetee's Wi-Fi, Johanna's elevator etiquette and Peeta's bakery. Each of 65 core jokes has local proposal variations and an illustrative district-matched photo. The latest rewrite was backed up first to `.local/democracy-before-mobile-memes.dump`; replacing fixtures resets test votes and returns the event to suggestions.

To deliberately retheme the seeded ideas and reset development votes, run `node --env-file=.env scripts/seed-panem.mjs --replace`. It only works in `democracy_dev`; non-demo suggestions and deleted tombstones are retained. The initial retheme was preceded by a full database backup in `.local/democracy-before-panem.dump`. `scripts/fetch-theme-photos.mjs` refreshes the 13 industry-matched Commons image URLs, author credits and license metadata in `db/fixtures/district-photos.json`.

## Docker deployment

1. Copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`).
2. Set a random `SESSION_SECRET` of at least 32 characters, a strong URL-safe `POSTGRES_PASSWORD`, and the public `APP_ORIGIN`. Keep local `DATABASE_URL` consistent with the password. Leave `DEV_TOOLS` disabled for normal deployments.
3. Run `docker compose up --build -d`.
4. Provision an administrator: `docker compose run --rm migrate node scripts/create-admin.mjs`. The generated credentials persist at `.local/admin-credentials.txt` through the administration container's bind mount. Alternatively use `npm run admin:create` locally when PostgreSQL is available on loopback.

The PostgreSQL volume persists across container restarts. `docker compose down` preserves it; `docker compose down -v` deletes it. Migrations run before the app starts. The app runs as a non-root user. PostgreSQL is published only on loopback for local administration. Place the app behind a TLS reverse proxy and back up PostgreSQL.

## Backend structure and extension points

`React event → API route → validation / authentication → service transaction → PostgreSQL`.

`src/client` owns React components, styles and interaction helpers. `src/server` owns database access, authentication, selection and aggregation. `src/contracts` contains only the shared request/response types. `src/app` wires pages and HTTP routes together. Lint rules and architecture tests enforce these import boundaries. Services are split by responsibility into suggestions, ballots, votes and overview/results.

The public frontend never downloads the complete suggestion catalogue, sampling settings or vote telemetry. Browsing uses filtered pages of at most 12 approved cards. Voting receives only the issued subset. District/category options load only when a form or interest picker needs them. Results are ranked on the server: winners arrive in pages of 12; the optional ranking loads on request in pages of 24 containing only ID, title, score and rank. Moderation keeps its separate authenticated, paginated endpoint.

| Path                                        | Responsibility                                                       |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `src/client/components/civic-app.tsx`       | Public phase views and interest selection                            |
| `src/client/components/suggestion-form.tsx` | Text / district / image submission                                   |
| `src/client/components/voting-panel.tsx`    | Method-specific controls and repeated voting                         |
| `src/client/components/admin-panel.tsx`     | Login, configuration, moderation, audit and test reset               |
| `src/app/api`                               | Explicit HTTP handlers and bounded input parsing                     |
| `src/server/services/`                      | Suggestion, ballot, vote and result transactions                     |
| `src/server/admin-service.ts`               | Phase changes, moderation and development reset                      |
| `src/server/admin-auth.ts`                  | Login, session verification and logout                               |
| `src/server/voting/selection.ts`            | Replaceable `SelectionStrategy` interface                            |
| `src/server/voting/strategies.ts`           | Replaceable voting validation and aggregation strategies             |
| `db/migrations`                             | Versioned SQL schema with transaction/advisory-lock migration runner |

**Selection:** approved projects only, drawn without replacement using a single combined weight:

```text
weight = (1 + globalViews)^(-globalExponent)
       × (chosenDistrict ? districtBoost : 1)
       × (anyChosenCategoryMatches ? categoryBoost : 1)
       × (1 + userViewsInThisMethod)^(-repeatExponent)
```

For methods with repeats disabled, the personal factor is exactly 1 for unseen ideas and 0 for seen ideas. Default strengths are 1, 3×, 2× and 1 respectively; approval, ranked and budget default to no repeats, while Elo permits them. Admin can change every strength and each method's repeat rule during voting; pending ballots expire and prior views/votes remain intact. Exponent 0 disables a penalty; multiplier 1 disables a preference boost. A category match boosts once regardless of the number of matching tags. Empty interests give no boost. Other districts and categories remain eligible.

The old 70/30 quota has been replaced; its database column and legacy sampler remain only for historical compatibility. Global views span users and methods. Personal views are scoped to this browser participant and method. A view means at least 25% of a voting card entered the viewport in a visible tab; the client reports it to `POST /api/ballots/:id/views`. The server validates ownership and membership and counts once per suggestion per ballot. Revisiting or refreshing the same ballot does not add views. Submission records any missing views as a fallback. View history starts at migration 006; old unobserved ballots are not retroactively labeled viewed. View counts and vote response counts are separate.

If fewer eligible ideas remain than the configured subset size, a smaller set is issued (minimum two). If fewer than two remain, the voter sees a completion message. No zero-weight idea is silently reintroduced. `candidateWeight` exposes the factors; `SelectionStrategy` remains independent of voting aggregation. Every new selection snapshot stores settings, categories, global/personal views and individual weight factors for analysis.

**Methods:** ranked uses normalized Borda points `(N-rank)/(N-1)`; approval records yes (1), neutral (0.5), or no (0); budget distributes exactly the configured integer total; Elo compares two projects using initial rating 1000 and K=32. To add a method, extend the method union, schema constraint, registry, admin select and voting controls. The subset sampler remains unchanged.

**Results:** non-Elo methods rank by mean points per appearance, displayed as support percentage, to compensate for unequal random exposure. Elo ranks by rating. Unvoted and non-approved projects are excluded. Equal scores share a dense rank; all projects within the configured top distinct ranks win, so ties can produce extra winners. Appearance counts show sample size.

**Integrity:** ballots are server-owned, browser-bound and expire after one hour. Submitted projects must match the issued subset exactly. Votes, aggregates and ballot completion commit atomically; duplicate submissions are idempotent. Stable score-row lock ordering protects concurrent Elo updates. Event locks serialize phase/moderation changes with participation.

| API                                     | Purpose                                                         |
| --------------------------------------- | --------------------------------------------------------------- |
| `GET /api/options`                      | District and category choices for forms                         |
| `GET /api/results?scope=winners&page=1` | Published winners; use scope=ranking for the compact ranking    |
| `GET /api/overview`                     | Phase and community counters only                               |
| `POST /api/suggestions`                 | Multipart title, description, districtId and optional image     |
| `GET /api/suggestions/:id/image`        | Approved image, or admin-only preview of a pending/hidden image |
| `POST /api/ballots/next`                | Create/resume a random ballot                                   |
| `POST /api/votes`                       | `{ ballotId, entries: [{ suggestionId, value }] }`              |
| `GET/POST/DELETE /api/admin/session`    | Verify session / log in / log out                               |
| `GET /api/admin`                        | Paginated, searchable moderation data and activity              |
| `PATCH /api/admin/event`                | Set phase and voting configuration                              |
| `PATCH /api/admin/suggestions/:id`      | Approve, hide or delete with an internal note                   |
| `POST /api/admin/reset`                 | Guarded development-only vote reset                             |
| `GET /api/health`                       | Database health                                                 |

`GET /api/preferences` reads district and category interests; `PUT /api/preferences` accepts `{districtIds: number[], categoryIds: number[]}`, validates both, always adds City-wide, writes cookies and expires mismatched pending ballots. `POST /api/suggestions` requires one to three repeated `categoryIds` form fields. Admin suggestion updates can include `categoryIds`; event updates include a validated `sampling` object (see `src/server/voting/sampling.ts`).

Uploads are capped at 5 MB and 24 million pixels, re-encoded to WebP, stripped of metadata and resized to at most 1400 × 1400. Real uploads persist in PostgreSQL. Demo photo URLs are only set by the trusted seed script. Public upload requests cannot supply arbitrary remote URLs. Image responses use no-store so newly moderated images are checked again.

## Verification

### Vote history and algorithm simulation

New ballots save `selection_context`: strategy version, weight settings, size, and every approved candidate's district, categories, response count, global/personal views and weight factors (including zero-weight exclusions). `district_ids`, `category_ids` and ordered `suggestion_ids` preserve interests and subset order. Each response saves `count_at_selection`, `count_before_vote`, `district_id` and `chosen_district` (false means a recommended district; City-wide is always chosen). Yes, neutral and no each increment the response count once.

`ballot.submission_counts` stores a full map of suggestion IDs to counts immediately before aggregation, shared by every response in that atomic ballot. `counts_captured_at`, creation and submission timestamps record timing. Counts come from the server, never the browser. A single query captures the full state; the ballot's score rows are locked, while unrelated ballots may commit after that snapshot. This is an issuance record, not proof a human looked at every card. Historical telemetry remains NULL; the migration expires old unsubmitted ballots without changing completed votes. Full snapshots intentionally trade database space for analysis detail.

Run the self-contained experiment:

```sh
docker compose -f compose.simulation.yaml up --build --abort-on-container-exit --exit-code-from simulation
docker compose -f compose.simulation.yaml down
```

This uses a separate Compose project, a private internal network with no published ports, and a temporary PostgreSQL filesystem. It does not mount `.env`, use application database credentials, or attach application volumes. The runner refuses any database other than `simulation` on `simulation-db`. Only `.local/simulation` is mounted to retain reports. The second command removes only this simulation's containers and network.

The current research experiment uses **20,000 active voters, 1,000 proposals and one pooled CHF 5 million budget**. It follows the supplied research brief's approximate demographic weights, not a claim of current official population. Exactly 900 local proposals are apportioned across eleven Gemeinden and 100 are canton-wide. Five themes and clipped LogNormal(10.5, 0.8) costs (CHF 15,000–400,000) are configurable in the Python modules.

Each voter chooses home plus zero to two Gemeinden from an explicit illustrative adjacency/commute graph. A ten-card deck has one or two canton-wide cards; local slots are equally split across interests with randomized remainders. No theme preferences are requested: the global maximum of two cards per theme means exactly two from each of five themes. Inside each scope/theme, weights are `(1 + impressions)^-1.5`. Every served card increments impressions, regardless of Endorse/Neutral/Object. Utilities are generated in three latent dimensions with a non-home decay; exactly 5% of voters are random speed runners.

**Normalization is explicit:** retain the signed score `(A - 0.75 R + 8)/(N + 20)`, then clip to [0,1] and multiply by eligible active voters. The provided constants are fixed-prior shrinkage, not fitted Empirical Bayes; the objection adjustment is not a Beta posterior probability. Home-Gemeinde response strata are shrunk toward each project score and calibrated to the same estimated total. Eligible voters within a home group receive exchangeable estimates. This imputation is necessary because project totals do not identify MES supporter coalitions. Latent truth never enters normalization or either allocation rule.

**Rules:** Greedy estimated support per CHF; additive-utility MES minimizing rho with payments `min(balance, rho * estimated utility)`; and exact SciPy/HiGHS 0/1 knapsack completion of MES's remaining budget. Core and completed MES are reported separately. The solver must certify completion optimality. This replaces the earlier experiment's raw approval ranking and cost-utility MES variant.

**Leave-Unterägeri-out:** both a fixed-deck withdrawal and a paired resampling run remove its participants, keep B and the project catalogue fixed, and recompute eligible active targets and B/N. All outcomes are evaluated on the original full electorate. This is descriptive sensitivity, not proof of significance or a causal effect of vote content alone, since electorate size and sampling can change.

Set `SIM_VOTERS` (default 20000), `SIM_BUDGET_CHF` (5000000), or `SIM_SEED` before the Compose commands above. Each run writes a new `.local/simulation/*-zug-research-seed-*/` directory; `latest-zug-research.json` points to the last successful report. Earlier reports are preserved. Stop/remove only this simulation's containers with its separate Compose file between runs. The production app's sampler, API and mock database are untouched.

The modules in `scripts/simulation` separate responsibilities:

| Module               | Responsibility                                                        |
| -------------------- | --------------------------------------------------------------------- |
| config.py / zug.json | Validated settings, scenario weights, commute graph and idea families |
| population.py        | Population allocation, projects, latent truth                         |
| elicitation.py       | Hierarchical sampling, ternary responses, impression replay           |
| normalization.py     | Signed shrinkage, eligible populations, calibrated imputation         |
| rules.py             | Greedy, additive MES and exact knapsack completion                    |
| evaluation.py        | Observed representation, true utility Gini, geography and LSO         |
| storage.py           | Safe database guard, CSV/NPZ and Pabulib exports                      |
| report.py            | HTML and publication-quality PDF/SVG/PNG figures                      |
| run.py               | End-to-end orchestration                                              |

Outputs include every winner, every voter's endorsed-winner count and realized utility, local/canton geographic accounts, project estimates, all ternary responses, conditional drawing probabilities, latent truth, estimated support matrices and source/version hashes. The report contains seven figure sets, core/completion results and both LSO comparisons.

`observed-approvals.pb` is an approval projection of the partial ballots; unshown cards remain unknown in the source ledger. `estimated-utilities.pb.gz` is a Pabulib scoring profile (decompress first); `estimated-utilities.npz` preserves full numerical precision. CSV/NPZ preserves ternary responses and missingness that approval projection cannot represent.

Complete states are losslessly stored as initial zeros, the ordered impression ledger and full checkpoints every 500 ballots. Run `python3 scripts/simulation/reconstruct_state.py OUTPUT_DIRECTORY SEQUENCE` for the base or resampled run; sequence is zero-based and may equal the total for final state. Fixed-deck LSO retains original issuance states, linked through `state-reference.json` to the base voter ID and slot, rather than pretending removed voters were absent at issuance.

Docker builds run tests against an independent exact-fraction MES implementation, exhaustive knapsack enumeration, quota/inverse-weight behavior, score clipping, calibrated totals, and isolation. Every complete base/resampled ballot history is replayed; the base electorate and every response are also persisted and checked in the private PostgreSQL schema. This numerical benchmark does not load-test the web app. Global impression CV can remain above zero because of structural quotas; no fabricated zero-CV or significance target is imposed.

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

With the local development server running and Chrome installed, run `npm run test:mobile` for phone touch gestures, answer review/editing, the district picker and overflow checks at 390px and 320px. These browser tests mock API responses and never write to the live database. Override `PLAYWRIGHT_BASE_URL` or `PLAYWRIGHT_CHANNEL` if needed.

Set `TEST_DATABASE_URL` to the development database, then run `npm run test:integration`. On PowerShell, load it without printing credentials:

```powershell
node --env-file=.env -e "process.env.TEST_DATABASE_URL=process.env.DATABASE_URL;const r=require('child_process').spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','--test','tests/database.integration.ts','tests/http.integration.ts'],{stdio:'inherit',env:process.env});process.exit(r.status??1)"
```

Tests create and drop random isolated schemas. The HTTP suite starts a separate app on port 3001 with `.next-test` output; it does not modify the sample dataset. Coverage includes auth/CSRF, upload and approval, all four vote methods, exact membership, ownership, duplicate/concurrent submission, moderation and ballot expiry, results, deletion, reset and logout. Without the database URL, integration tests are explicitly skipped.

## Scope

This is a single-event prototype with username/password accounts. It does not verify residency or prevent multiple accounts; repeated ballots are intentional. Submissions are capped at ten per account per hour. Password recovery and email verification are not implemented.

## Participant accounts and badges

Signup and login use `POST /api/account` with username, password and a boolean `signup`. Usernames are case-insensitive (3–40 letters, numbers or underscores); passwords require 10–128 characters. Salted scrypt hashes are stored server-side. Random 30-day session tokens are stored only as SHA-256 hashes in PostgreSQL and sent through HTTP-only SameSite=Lax cookies; HTTPS enables Secure. Logout revokes the current session. Authentication attempts are limited to 20 per username and 500 globally per 15 minutes. All mutations check the configured browser origin.

`GET /api/account` returns only the current username or null. Voting, exposure recording, preference changes, suggestion submission and `GET /api/account/achievements` require a user session. An admin session alone does not grant participant access. Approved suggestions, filters and published results remain public. Old anonymous records are preserved but are not assigned to new accounts; old preference cookies are no longer used.

Open **Account** for personal most-voted district/category badges. Every submitted response counts once, including neutral and no; each of a suggestion’s categories counts once. Badges track the leading district/category, using the lowest ID for ties, and stay locked until the first response. Category IDs are captured with votes so later moderation does not rewrite achievements. Retried submissions do not add progress. Resetting test votes also resets these derived badges.

Migration `007_accounts.sql` adds account/session/preferences storage, historical vote categories and the default-off auto-approval setting without changing existing suggestions. Public signup is separate from CLI-provisioned administrator access.

## Cumulative Voting

Before issuing any ballots, select **Cumulative Voting** in admin. Set the **Funding budget (CHF)** and batch size (3–8, initially 8), then review each proposal’s **Estimated project cost (CHF)** using **Save cost**. Migration `008_cumulative.sql` assigns old prototype proposals CHF 10,000 placeholder estimates and initializes the funding budget to CHF 1,000,000. These are test defaults, not researched costs. New suggestion forms ask for a cost; older API clients that omit it receive the same placeholder. Funding and project costs lock after the first cumulative batch; moderation can still hide/delete projects. Other voting methods remain available for new rounds.

Every account has **100 points across all cumulative batches**, not 100 per batch. Controls allocate whole votes: a project with `v` votes costs `v²` points (1→1, 2→4, 3→9, 10→100). At least one point must be allocated to confirm; zero allocations on other cards are valid. A persistent wallet shows saved spending, the draft cost and points left after confirmation. PostgreSQL transactions lock the participant before reading the ledger, validating the remaining balance and committing votes. Retries do not charge twice; unused points follow the account across devices. Removing a voted project does not refund points.

`cumulative-selection.ts` and `cumulative-ballots.ts` implement a separate selection policy: two unseen City-wide projects when available, with remaining slots drawn only from selected districts. If fewer than two global projects remain, local projects can fill those slots. If local projects run out, batches shorten instead of adding extra global cards. A final batch may have one project. When no eligible unseen projects remain, the app preserves the unspent balance and invites the user to change districts or return later.

Topic strata are balanced greedily: draw from a least-represented available category, choosing tied categories uniformly. Within that stratum use weight `1/(1 + prior batch inclusions)`. A multi-category idea occupies one selected topic stratum per draw. This is stratified inverse sampling, not a claim that unconditional probabilities are purely inverse. Global slots are drawn first; local strata consider those topics. Category preferences and the other methods’ weight controls do not apply.

`ballot_inclusion` records every issued card independently of browser views and votes, including existing ballots backfilled by the migration. Refreshes reuse the same pending ballot. For cumulative voting, expired/abandoned/changed-interest batches also exclude their cards from future batches. The database retains issuance-time candidate counts, every allocated vote, its squared point charge and each submitted batch’s total charge. The guarded development vote reset clears ballots/inclusions and restores wallets while keeping costs and suggestions.

**Results use cardinal-utility Method of Equal Shares (MES)** with the actual CHF project costs and funding budget. Each account that submitted a cumulative ballot receives an equal virtual share `B/N`. Allocated votes are utilities; the quadratic point charges are not utilities or funding costs. Repeatedly choose the affordable project minimizing `rho`, where supporters pay `min(remaining share, rho × votes)`. Ties use ascending project UUID. Hidden/deleted projects cannot win. Accounts with only abandoned batches do not enter `N`; users whose supported projects were removed still do. Unshown ideas provide no expressed support; there is no imputation or exposure normalization.

This implements the core MES rule, with **no top-up/completion rule**, so it can leave funding unspent. The old winning-rank count does not apply. Winner cards show selection order, total votes and cost; the optional full list orders projects by raw vote totals, which is not the allocation rule. Individual vote profiles remain server-side and result pages are bounded. See the [additive-utility MES paper](https://dominik-peters.de/publications/equal-shares.pdf) and [method explanation](https://equalshares.net/explanation/).

Unit tests compare MES against independent bisection-based payments on varied sparse profiles. `tests/cumulative.integration.ts` checks issuance quotas, no repeats, scarcity, quadratic spending, concurrent retry safety, budget exhaustion and funded results in an isolated database schema. The HTTP suite also exercises admin costs and funding locks. Mobile tests cover carryover, final spending and the visible wallet without modifying live data.
