# Voting and results

This document describes the current cumulative voting implementation. The approval, ranked, shared-budget and Elo methods are old, unfinished prototypes; their rules differ and are not described here.

## Participation

1. During the suggestion phase, account holders submit projects with a district, 1–3 categories, an estimated CHF cost and optional image/location details. Administrators approve submissions or enable automatic approval.
2. During voting, signed-in users allocate a personal budget of **100 coins**. Project details are locked to administrators. Explore is disabled; the voting catalog remains available.
3. During results, the app publishes funded projects, feedback counts and personal impact reports. Funding selection and actual implementation are separate: administrators record delivery status.

## Finding projects

Random batches include approved projects from the user's selected districts and City-wide. The configured batch size reserves up to two City-wide slots and fills the remainder with local projects. Scarcity can shorten a batch; missing global slots can be filled by local projects. Extra global projects do not replace missing local projects.

Within each draw, the sampler randomly selects among the least-represented available topics, then uniformly selects a project containing that topic. A multi-category project counts toward the topic used for that draw. This encourages topic diversity; it is not uniform sampling over all projects.

A project already issued in a cumulative batch, or already in the user's basket, is excluded from new random batches. One extra batch is buffered ahead. Issued projects and actually viewed projects are therefore different counts. Historical vote and inclusion counts are recorded but **do not affect cumulative sampling weights**. Category interests do not boost this sampler.

The searchable, infinitely loaded catalog is a separate route to all approved projects matching its filters. It does not restrict projects to the user's saved interests. Catalog ordering is randomized. Users may revisit projects there to adjust unconfirmed allocations.

## Coins and confirmation

Allocating `c` coins to one project gives `sqrt(c)` votes. The interface adds whole votes: 1, 2, 3 and 4 votes cost 1, 4, 9 and 16 coins respectively. Adding the next vote costs 1, 3, 5, 7, … additional coins. The backend computes the square root of the recorded coin allocation.

The 100-coin limit applies across all projects, not to each batch. Draft allocations can be moved or removed in the overview. Removing a vote returns the corresponding quadratic cost, without reducing an already confirmed allocation.

“Overview & confirm” commits the current allocation. At least one coin must be allocated; spending all 100 is optional. **Confirmed allocations are locked**, while remaining coins may still be spent and confirmed later. Later confirmations replace the account's active ballot snapshot, so earlier confirmations are not counted twice. Draft coins do not count toward results.

Feedback is separate from voting: one feedback tag per account per project, changeable during voting. Feedback tags and achievements do not affect funding selection. Public feedback counts appear after voting; administrators can inspect counts during the round.

## Selecting funded projects

The implementation uses actual estimated project costs and the administrator's total CHF funding budget. There are no population-based district budget quotas and no fixed number of cumulative winners.

Only approved projects are eligible. The electorate consists of distinct accounts with active, submitted cumulative ballots. Each project receives that account's confirmed vote value as its utility. Unfunded drafts, superseded ballots and unexpressed preferences contribute no utility.

### 1. Method of Equal Shares (MES)

With funding budget `B` and `N` participating voters, give every voter a virtual balance of `B / N`. These CHF balances are separate from voting coins.

For each project, find the smallest price per utility unit `rho` such that its supporters can cover its cost through payments:

`payment(i) = min(remaining_balance(i), rho × utility(i, project))`

Select the affordable project with the smallest `rho`, deduct these payments, and repeat. Ties within the numerical tolerance are resolved by project ID. Stop when no further project can be paid for from its supporters' remaining balances. Projects with no positive support cannot be funded.

### 2. Greedy completion

Keep all MES winners. Sort remaining positively supported projects by:

1. Total confirmed votes divided by project cost, descending.
2. Total confirmed votes, descending.
3. Cost, ascending.
4. Project ID.

Add each project if it fits within the remaining total budget; otherwise skip it. This is a **greedy knapsack completion**, not an exact knapsack optimizer. Money may remain if no remaining supported project fits. No partial projects are funded and the total funding budget is never exceeded.

The public score ranking shows total support; it is not the MES selection order and does not itself determine winners.

## Personal impact and implementation

Public results and personal impact use the same funding calculation. Personal reports show confirmed coins/votes, supported winners and delivery updates. MES contributions are the actual virtual payments recorded by the algorithm. Greedy additions use pooled remaining funding, so the report does not attribute a personal CHF payment to them.

The downloadable PDF is a snapshot of those results. Estimated costs and winning status are not proof of spending or implementation; delivery status is reported separately by administrators.

## Implementation references

- `src/server/voting/cumulative-selection.ts`: random batches and topic balancing.
- `src/server/services/cumulative-cart.ts`: draft budget and confirmed allocation limits.
- `src/server/services/confirm-cumulative-checkout.ts`: confirmation and active ballot replacement.
- `src/server/services/mes-results.ts`: eligible projects and confirmed voter utilities.
- `src/server/voting/mes.ts`: MES prices and payments.
- `src/server/voting/mes-completion.ts`: greedy completion and tie-breaking.
- `src/server/services/personal-impact.ts`: personal reports using the same outcome.
