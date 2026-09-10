import { test, expect, type Page } from '@playwright/test';
import { defaultSampling } from '../src/server/voting/sampling';

test('proposal details scroll in place, trap focus, and pause arrow-key voting', async ({
  page,
}) => {
  const submitted = await mockRound(page);
  await page.route('**/api/ballots/next', (route) =>
    route.fulfill({
      json: {
        id: 'details-ballot',
        method: 'approval',
        completed: 0,
        suggestions: [
          {
            id: 'details-1',
            title: 'A shared garden for Zürich',
            district: 'Kreis 3 · Wiedikon',
            district_id: 3,
            categories: [{ id: 2, name: 'Environment' }],
            cost: 2800,
            has_image: true,
            image_url: '/coin.svg',
            description: Array.from(
              { length: 12 },
              (_, i) =>
                `Part ${i + 1}: Neighbours share raised beds, accessible paths and seasonal herbs. Volunteers look after the garden and welcome new growers.`,
            ).join('\n\n'),
          },
        ],
      },
    }),
  );
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const info = page.getByRole('button', { name: 'View details of A shared garden for Zürich' });
  await info.click();
  const dialog = page.getByRole('dialog', { name: 'A shared garden for Zürich' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('CHF 2,800');
  await expect(dialog).toContainText('Part 12:');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  expect(submitted).toHaveLength(0);
  await expect(page.getByText('0/1 answered')).toBeVisible();
  const scrolling = dialog.locator('.proposal-dialog-scroll');
  expect(await scrolling.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await scrolling.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await scrolling.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Close proposal details' })).toBeInViewport();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: '.local/proposal-details-dark-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(info).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  // Holding the swipe surface opens details without changing the answer.
  const surface = page.locator('.swipe-surface');
  await surface.scrollIntoViewIfNeeded();
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(dialog).toBeVisible();
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await expect(page.getByText('0/1 answered')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Ready to send?' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('theme follows the browser, remembers overrides and applies to admin', async ({ page }) => {
  await mockRound(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const theme = page.getByRole('combobox', { name: 'Color theme' });
  await expect(theme).toHaveValue('system');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 26, 22)');
  await expect(page.locator('.project-card').first()).toHaveCSS(
    'background-color',
    'rgb(27, 41, 33)',
  );
  await theme.selectOption('light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 248, 242)');
  await page.reload();
  await expect(theme).toHaveValue('light');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 248, 242)');
  await theme.selectOption('system');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 26, 22)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 248, 242)');
  await theme.selectOption('dark');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.screenshot({ path: '.local/dark-explore-mobile.png', fullPage: true });
  await page.route('**/api/admin?**', (route) =>
    route.fulfill({ status: 401, json: { error: 'Sign in' } }),
  );
  await page.goto('/admin');
  await expect(theme).toHaveValue('dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 26, 22)');
  await expect(page.locator('input[name="username"]')).toBeVisible();
  await page.screenshot({ path: '.local/dark-admin-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

// Mock only HTTP data: real React rendering, CSS, pointer events and browser scrolling run.
// This does not change phases, credentials, preferences or votes in the live database.
async function mockRound(page: Page, configured = true) {
  const suggestions = Array.from({ length: 3 }, (_, i) => ({
    id: `idea-${i}`,
    title: [
      'Beetee’s universal charging cable',
      'Rue’s four-note notification system',
      'Peeta’s bakery loyalty card',
    ][i],
    description:
      'A fictional community proposal about the Hunger Games. Residents can help shape this idea and decide whether it deserves their support.',
    district: `District ${i + 1}`,
    district_id: i + 1,
    has_image: false,
    created_at: '2026-09-09',
    categories: [{ id: 1, name: 'Community' }],
  }));
  let issued = 0;
  let savedDistricts = [1, 13],
    savedCategories: number[] = [];
  const submissions: { entries: { suggestionId: string; value: number }[] }[] = [];
  const districts = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    name: `District ${i + 1}`,
    is_citywide: false,
  })).concat([{ id: 13, name: 'City-wide', is_citywide: true }]);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path === '/api/overview')
      body = { phase: 'voting', suggestionCount: 3, ballotCount: submissions.length };
    else if (path === '/api/account') body = { account: { username: 'mobiletester' } };
    else if (path === '/api/account/suggestions')
      body = { items: [], nextPage: null, phase: 'voting' };
    else if (path === '/api/account/achievements')
      body = {
        totalVotes: 3,
        district: { id: 1, name: 'District 1', votes: 2 },
        category: { id: 1, name: 'Community', votes: 3 },
      };
    else if (path === '/api/suggestions') body = { items: suggestions, nextPage: null };
    else if (path === '/api/options')
      body = { districts, categories: [{ id: 1, name: 'Community' }] };
    else if (path === '/api/preferences') {
      if (route.request().method() === 'PUT') {
        configured = true;
        const input = route.request().postDataJSON();
        savedDistricts = input.districtIds;
        savedCategories = input.categoryIds;
      }
      body = { configured, districtIds: savedDistricts, categoryIds: savedCategories };
    } else if (path === '/api/ballots/next')
      body = {
        id: `ballot-${issued++}`,
        method: 'approval',
        suggestions,
        voteBudget: 10,
        completed: submissions.length,
      };
    else if (path.endsWith('/views')) body = { ok: true };
    else if (path === '/api/votes') {
      submissions.push(route.request().postDataJSON());
      body = { accepted: true };
    } else return route.fulfill({ status: 404, json: { error: 'Unexpected test route' } });
    await route.fulfill({ json: body });
  });
  return submissions;
}
async function touchSwipe(page: Page, dx: number, dy: number) {
  const surface = page.locator('.swipe-surface');
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  if (!box) throw new Error('Missing swipe photo');
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 5; i++)
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * i) / 5, y: y + (dy * i) / 5 }],
    });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}
test('phone touch swipes select yes, neutral, no and submit only after review', async ({
  page,
}) => {
  const submitted = await mockRound(page);
  await page.goto('/');
  await expect(page.getByText('Idea 1 of 3')).toBeVisible();
  await touchSwipe(page, 100, 0);
  await expect(page.getByText('Idea 2 of 3')).toBeVisible();
  await touchSwipe(page, 0, -85);
  await expect(page.getByText('Idea 3 of 3')).toBeVisible();
  await touchSwipe(page, -100, 0);
  await expect(page.getByRole('heading', { name: 'Ready to send?' })).toBeVisible();
  expect(submitted).toHaveLength(0);
  await expect(page.locator('.review-choice strong')).toHaveText(['Yes', 'Neutral', 'No']);
  await page.getByRole('button', { name: 'Submit & discover more' }).click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0].entries.map((e) => e.value)).toEqual([1, 0.5, 0]);
  await expect(page.getByText('Idea 1 of 3')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('320px district picker has no district categories, City-wide stays selected', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await mockRound(page, false);
  await page.goto('/');
  await expect(page.getByText('Where do you')).toBeVisible();
  const city = page
    .locator('.district-choice')
    .filter({ hasText: 'City-wide' })
    .getByRole('checkbox');
  await expect(city).toBeChecked();
  await expect(city).toBeDisabled();
  await expect(
    page.locator('.district-choice').filter({ hasText: 'District 1' }).first().locator('small'),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Save my districts' }).click();
  await expect(page.getByText('Idea 1 of 3')).toBeVisible();
  await touchSwipe(page, 10, 0);
  await expect(page.getByText('Idea 1 of 3')).toBeVisible();
  const yes = page.getByRole('button', { name: 'Yes Swipe right' });
  await yes.click();
  await expect(page.getByText('Idea 2 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Review choices' }).click();
  await page
    .getByRole('button', { name: 'Edit answer for Beetee’s universal charging cable' })
    .click();
  await page.getByRole('button', { name: 'No Swipe left' }).click();
  await page.getByRole('button', { name: 'Review choices' }).click();
  await expect(page.locator('.review-choice strong').first()).toHaveText('No');
});

test('arrow keys vote without submitting, ignore held keys and stop at review', async ({
  page,
}) => {
  const submitted = await mockRound(page);
  await page.goto('/');
  await expect(page.getByText('Idea 1 of 3')).toBeVisible();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByText('Idea 1 of 3')).toBeVisible();
  await page.keyboard.down('ArrowRight');
  await expect(page.locator('.swipe-card')).toHaveClass(/exiting/);
  await expect(page.getByText('Idea 1 of 3')).toBeVisible();
  await expect(page.getByText('Idea 2 of 3')).toBeVisible();
  await page.keyboard.down('ArrowRight');
  await expect(page.getByText('Idea 2 of 3')).toBeVisible();
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByText('Idea 3 of 3')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.swipe-preview.answer-no')).toHaveCSS('right', '20px');
  await expect(page.locator('.review-choice strong')).toHaveText(['Yes', 'Neutral', 'No']);
  await page.keyboard.press('ArrowRight');
  expect(submitted).toHaveLength(0);
  await expect(page.locator('.review-choice strong')).toHaveText(['Yes', 'Neutral', 'No']);
});

test('district bulk controls keep City-wide and category choices are saved', async ({ page }) => {
  await mockRound(page, false);
  await page.goto('/');
  await page.getByRole('button', { name: 'Select all districts', exact: true }).click();
  await expect(page.locator('.district-choice input:checked')).toHaveCount(13);
  await page.getByRole('button', { name: 'Unselect all districts', exact: true }).click();
  await expect(page.locator('.district-choice input:checked')).toHaveCount(1);
  await expect(page.locator('.district-choice input:checked')).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Community', exact: true }).check();
  const saved = page.waitForRequest(
    (request) => request.url().endsWith('/api/preferences') && request.method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save my districts' }).click();
  expect((await saved).postDataJSON()).toEqual({ districtIds: [13], categoryIds: [1] });
});

test('admin can change weights and repeat rules on a phone during voting', async ({ page }) => {
  let saved: { sampling: typeof defaultSampling; auto_approve: boolean } | undefined;
  const event = {
    id: 1,
    title: 'Test',
    phase: 'voting',
    method: 'approval',
    subset_size: 3,
    vote_budget: 10,
    winner_count: 3,
    selected_district_percent: 70,
    sampling: defaultSampling,
    auto_approve: false,
    funding_budget: 1000000,
  };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/admin/event') {
      saved = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({
      json: {
        event,
        admin: { username: 'test' },
        categories: [],
        counts: [],
        ballots: { issued: 10, submitted: 1 },
        suggestions: [],
        total: 0,
        page: 1,
        devTools: false,
        audit: [],
      },
    });
  });
  await page.goto('/admin');
  await page.getByRole('spinbutton', { name: /Chosen district multiplier/ }).fill('4');
  await page.getByRole('checkbox', { name: 'Yes / neutral / no', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Automatically approve new suggestions' }).check();
  await page.locator('.admin-settings').screenshot({ path: '.local/admin-weights-mobile.png' });
  await page.getByRole('button', { name: 'Save round settings' }).click();
  await expect.poll(() => saved?.sampling.districtBoost).toBe(4);
  expect(saved?.sampling.repeats.approval).toBe(true);
  expect(saved?.auto_approve).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('voting loads only its subset, with no catalogue, choices or results prefetch', async ({
  page,
}) => {
  const paths: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) paths.push(new URL(request.url()).pathname);
  });
  await mockRound(page);
  await page.goto('/');
  await expect(page.getByText('Idea 1 of 3')).toBeVisible();
  expect(paths).not.toContain('/api/options');
  expect(paths).not.toContain('/api/results');
  expect(paths).not.toContain('/api/suggestions');
  await page.getByRole('button', { name: 'Change interests' }).click();
  await expect(
    page.getByRole('button', { name: 'Select all districts', exact: true }),
  ).toBeVisible();
  expect(paths.filter((p) => p === '/api/options')).toHaveLength(1);
});

test('results fetch ranking only when requested', async ({ page }) => {
  const scopes: string[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/overview')
      return route.fulfill({ json: { phase: 'results', suggestionCount: 1000, ballotCount: 20 } });
    if (url.pathname === '/api/account')
      return route.fulfill({ json: { account: { username: 'tester' } } });
    if (url.pathname === '/api/preferences')
      return route.fulfill({ json: { configured: true, districtIds: [13], categoryIds: [] } });
    if (url.pathname === '/api/results') {
      const scope = url.searchParams.get('scope')!;
      scopes.push(scope);
      const common = { id: 'winner', title: 'A community bakery', score: 100, rank: 1 };
      return route.fulfill({
        json: {
          method: 'approval',
          nextPage: null,
          items: [
            scope === 'winners'
              ? {
                  ...common,
                  description: 'Bread for everyone.',
                  district: 'District 12',
                  district_id: 12,
                  has_image: false,
                  categories: [],
                  appearances: 20,
                }
              : common,
          ],
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: 'Unexpected request' } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A community bakery' })).toBeVisible();
  expect(scopes).toEqual(['winners']);
  await page.getByRole('button', { name: 'See all project results' }).click();
  await expect(page.locator('.result-row')).toHaveCount(1);
  expect(scopes).toEqual(['winners', 'ranking']);
});

test('guest browses on a small phone, signs up, saves interests and views personal badges', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await mockRound(page, false);
  let signedIn = false;
  await page.route('**/api/account', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(body.signup).toBe(true);
      signedIn = true;
    }
    if (route.request().method() === 'DELETE') signedIn = false;
    return route.fulfill({ json: { account: signedIn ? { username: 'mobiletester' } : null } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Explore ideas' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Beetee’s universal charging cable' }),
  ).toBeVisible();
  await expect(page.locator('.district-picker')).toHaveCount(0);
  await page.getByRole('button', { name: 'Vote', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in to vote' }).click();
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Username', { exact: true }).fill('mobiletester');
  await page.getByLabel('Password', { exact: true }).fill('a good test password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Community', exact: true }).check();
  await page.getByRole('button', { name: 'Save my districts' }).click();
  await expect(page.getByText('Idea 1 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Account · mobiletester' }).click();
  await expect(page.locator('.voting-badge.earned')).toHaveCount(2);
  await expect(page.locator('.voting-badge').first()).toContainText('District 1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const header = await page.locator('.topbar').boundingBox();
  const round = await page.locator('.account-panel').boundingBox();
  expect(header!.y + header!.height).toBeLessThanOrEqual(round!.y);
  await page.screenshot({ path: '.local/account-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to vote' })).toBeVisible();
  await expect(page.locator('.swipe-card')).toHaveCount(0);
});

test('cumulative phone basket spans samples and catalog, swaps coins and confirms once', async ({
  page,
}) => {
  await mockRound(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  let batch = 0,
    revision = 0,
    checkoutRevision = -1,
    confirmations = 0;
  let coins: Record<string, number> = {},
    confirmed: Record<string, number> = {};
  const sources: string[] = [];
  const queries: URL[] = [];
  const project = (id: string, title: string, district = 13) => ({
    id,
    title,
    description: 'A proposal for shared neighbourhood equipment.',
    district: district === 13 ? 'City-wide' : 'Kreis 2',
    district_id: district,
    has_image: false,
    categories: [{ id: 1, name: 'Community' }],
    cost: 1500,
  });
  const all: Record<string, ReturnType<typeof project>> = {};
  for (let b = 0; b < 2; b++)
    for (let i = 0; i < 3; i++) {
      const id = `b${b}-${i}`;
      all[id] = project(id, `Batch ${b + 1} idea ${i}`);
    }
  all.catalog = project('catalog', 'Library in another district', 2);
  const state = () => ({ revision, checkoutRevision, coins, confirmed });
  const remaining = () => 100 - Object.values(coins).reduce((sum, n) => sum + n, 0);
  const ballot = () => ({
    id: `b${batch}`,
    method: 'cumulative',
    remainingPoints: remaining(),
    completed: 0,
    suggestions: remaining() ? Object.values(all).filter((s) => s.id.startsWith(`b${batch}-`)) : [],
    ...(!remaining() ? { finished: 'budget-exhausted' } : {}),
  });
  await page.route('**/api/ballots/next', (route) => route.fulfill({ json: ballot() }));
  await page.route('**/api/cumulative/next', (route) => {
    batch = Number(route.request().postDataJSON().after.slice(1)) + 1;
    return route.fulfill({
      json:
        batch > 1
          ? { ...ballot(), id: '', suggestions: [], finished: 'ideas-exhausted' }
          : ballot(),
    });
  });
  await page.route('**/api/cumulative/cart', async (route) => {
    if (route.request().method() === 'PATCH') {
      const input = route.request().postDataJSON();
      expect(input.revision).toBe(revision);
      sources.push(input.source);
      coins = { ...coins, [input.suggestionId]: input.coins };
      if (!input.coins) delete coins[input.suggestionId];
      revision++;
      expect(remaining()).toBeGreaterThanOrEqual(0);
    }
    await route.fulfill({ json: state() });
  });
  await page.route('**/api/cumulative/checkout', (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON().revision).toBe(revision);
      confirmed = { ...coins };
      checkoutRevision = revision;
      confirmations++;
      return route.fulfill({ json: state() });
    }
    return route.fulfill({
      json: {
        cart: state(),
        projects: Object.entries(coins)
          .sort((a, b) => b[1] - a[1])
          .map(([id]) => ({ ...all[id], available: true })),
      },
    });
  });
  await page.route('**/api/account/cumulative-votes', (route) =>
    route.fulfill({
      json: Object.entries(confirmed)
        .sort((a, b) => b[1] - a[1])
        .map(([id, amount]) => ({
          id,
          title: all[id].title,
          district: all[id].district,
          coins: amount,
          votes: Math.sqrt(amount),
        })),
    }),
  );
  await page.route('**/api/suggestions?**', (route) => {
    queries.push(new URL(route.request().url()));
    return route.fulfill({ json: { items: [all.catalog], nextPage: null } });
  });
  await page.goto('/');
  const wallet = page.locator('.cumulative-wallet');
  await expect(wallet).toContainText('100 coins left');
  expect(queries).toHaveLength(0);
  const add = page.getByRole('button', {
    name: 'Add coins for the next vote to Batch 1 idea 0',
    exact: true,
  });
  await page.getByRole('button', { name: 'View details of Batch 1 idea 0' }).click();
  await page.getByRole('button', { name: 'Close proposal details' }).click();
  await add.scrollIntoViewIfNeeded();
  const box = (await add.boundingBox())!;
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  });
  await expect(page.getByRole('dialog')).toBeVisible();
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.detach();
  await page.getByRole('button', { name: 'Close proposal details' }).click();
  expect(coins).toEqual({});
  await add.click();
  await expect(wallet).toContainText('99 coins left');
  await add.focus();
  await page.keyboard.press('Enter');
  await expect(wallet).toContainText('96 coins left');
  await page.keyboard.press('Space');
  await expect(wallet).toContainText('91 coins left');
  const remove = page.getByRole('button', { name: 'Remove 1 vote from Batch 1 idea 0' });
  const removeBox = (await remove.boundingBox())!,
    pyramid = (await page.locator('.coin-pyramid').first().boundingBox())!;
  expect(removeBox.y + removeBox.height).toBeLessThan(pyramid.y);
  expect(removeBox.x).toBeLessThan(pyramid.x + pyramid.width / 2);
  await remove.click();
  await expect(wallet).toContainText('96 coins left');
  await expect(page.locator('.coin-totals').first()).toContainText('2 votes');
  await expect(page.getByRole('button', { name: 'Next random sample' })).toHaveCount(0);
  await expect.poll(() => batch).toBe(1);
  await expect(
    page.getByRole('button', {
      name: 'Add coins for the next vote to Batch 2 idea 0',
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByText('Scroll to discover more proposals.').scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('button', {
      name: 'Add coins for the next vote to Batch 2 idea 0',
      exact: true,
    }),
  ).toBeVisible();
  for (let i = 0; i < 3; i++)
    for (let n = 0; n < (i === 0 ? 8 : 4); n++)
      await page
        .getByRole('button', {
          name: `Add coins for the next vote to Batch 2 idea ${i}`,
          exact: true,
        })
        .click();
  await expect(wallet).toContainText('0 coins left');
  expect(confirmations).toBe(0);
  const nextSteps = page.getByRole('region', { name: 'Next steps' });
  await expect(
    nextSteps.getByRole('button', { name: 'Search catalog', exact: true }),
  ).toBeVisible();
  await nextSteps.getByRole('button', { name: 'Overview & confirm', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Funding checkout' })).toBeVisible();
  await expect(page.locator('.funding-review-project')).toHaveCount(4);
  await page.getByRole('button', { name: 'Remove 1 vote from Batch 1 idea 0' }).click();
  await expect(wallet).toContainText('3 coins left');
  await page.getByRole('button', { name: 'Search catalog', exact: true }).click();
  const catalog = page.getByRole('region', { name: 'Community ideas' });
  await catalog.getByRole('combobox', { name: 'District', exact: true }).selectOption('2');
  await catalog.getByRole('combobox', { name: 'Category', exact: true }).selectOption('1');
  await catalog.getByRole('searchbox').fill('Library');
  await catalog.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('search')).toBe('Library');
  expect(queries.at(-1)?.searchParams.get('district')).toBe('2');
  expect(queries.at(-1)?.searchParams.get('category')).toBe('1');
  await page
    .getByRole('button', { name: 'Add coins for the next vote to Library in another district' })
    .click();
  await expect(wallet).toContainText('2 coins left');
  await page.getByRole('button', { name: 'Back to random samples' }).click();
  expect(batch).toBe(2);
  await expect(wallet).toContainText('2 coins left');
  await page.getByRole('button', { name: 'Overview & confirm', exact: true }).first().click();
  await expect(page.locator('.funding-review-project')).toHaveCount(5);
  await page.getByRole('button', { name: 'Remove 1 vote from Batch 1 idea 0' }).click();
  await expect(wallet).toContainText('3 coins left');
  await page.getByRole('button', { name: 'Add 1 vote to Library in another district' }).click();
  await expect(wallet).toContainText('0 coins left');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '.local/funding-checkout-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirm funding', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All 100 coins put to work.' })).toBeVisible();
  expect(confirmations).toBe(1);
  await expect(page.getByRole('button', { name: 'Adjust allocations' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Overview & confirm' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Back to random samples' })).toHaveCount(0);
  expect(sources).toContain('catalog');
  expect(sources).toContain('checkout');
  const summary = page.getByRole('region', { name: 'Your votes', exact: true });
  await expect(summary.locator('.summary-votes strong')).toHaveText([
    '8 votes',
    '4 votes',
    '4 votes',
    '2 votes',
  ]);
  await expect(summary).toContainText('Library in another district');
  await page.reload();
  await expect(summary.getByRole('listitem')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('public idea search submits to the server and preserves district/category filters', async ({
  page,
}) => {
  await mockRound(page);
  const queries: URL[] = [];
  await page.route('**/api/suggestions?**', async (route) => {
    queries.push(new URL(route.request().url()));
    await route.fulfill({ json: { items: [], nextPage: null } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page
    .getByRole('region', { name: 'Community ideas' })
    .getByRole('combobox', { name: 'District', exact: true })
    .selectOption('1');
  await page
    .locator('.category-chips')
    .getByRole('button', { name: 'Community', exact: true })
    .click();
  await page.getByRole('searchbox', { name: 'Search community ideas' }).fill('Peeta & bread');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('search')).toBe('Peeta & bread');
  expect(queries.at(-1)?.searchParams.get('district')).toBe('1');
  expect(queries.at(-1)?.searchParams.get('category')).toBe('1');
  expect(queries.at(-1)?.searchParams.get('page')).toBe('1');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('search')).toBe('');
});

test('account owners edit their ideas in phase one and see a locked list during voting', async ({
  page,
}) => {
  await mockRound(page);
  let phase = 'suggestions';
  let title = 'My community bakery';
  let saved = false;
  await page.route('**/api/overview', (route) =>
    route.fulfill({ json: { phase, suggestionCount: 1, ballotCount: 0 } }),
  );
  await page.route('**/api/account/suggestions?**', (route) =>
    route.fulfill({
      json: {
        phase,
        nextPage: null,
        items: [
          {
            id: 'mine',
            title,
            description: 'A community bakery for everyone in our district.',
            district_id: 1,
            district: 'District 1',
            categories: [{ id: 1, name: 'Community' }],
            cost: 12000,
            has_image: false,
            status: 'pending',
          },
        ],
      },
    }),
  );
  await page.route('**/api/suggestions/mine', async (route) => {
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().postData()).toContain('My improved bakery');
    saved = true;
    title = 'My improved bakery';
    await route.fulfill({ json: { id: 'mine', status: 'pending' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Account · mobiletester' }).click();
  await page.getByRole('button', { name: 'Edit My community bakery', exact: true }).click();
  await page.getByRole('textbox', { name: 'Give your idea a name' }).fill('My improved bakery');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => saved).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'My improved bakery', exact: true }),
  ).toBeVisible();
  phase = 'voting';
  await page.reload();
  await page.getByRole('button', { name: 'Account · mobiletester' }).click();
  await expect(
    page.getByText('Your ideas are locked for this phase. Only administrators can edit them.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit My improved bakery' })).toHaveCount(0);
});

test('scrolling reserves one batch, retries safely and needs no coin allocation', async ({
  page,
}) => {
  await mockRound(page);
  const requested: string[] = [];
  let fail = true;
  const sample = (n: number) => ({
    id: 'sample-' + n,
    method: 'cumulative',
    completed: 0,
    remainingPoints: 100,
    suggestions: Array.from({ length: 3 }, (_, i) => ({
      id: n + '-' + i,
      title: 'Proposal ' + n + '-' + i,
      description: 'A community project.',
      district: 'City-wide',
      district_id: 1,
      categories: [],
      cost: 500,
      has_image: false,
    })),
  });
  await page.route('**/api/ballots/next', (route) => route.fulfill({ json: sample(0) }));
  await page.route('**/api/cumulative/cart', (route) =>
    route.fulfill({ json: { revision: 0, checkoutRevision: -1, coins: {} } }),
  );
  await page.route('**/api/cumulative/next', (route) => {
    const { after } = route.request().postDataJSON();
    requested.push(after);
    if (fail) {
      return route.fulfill({ status: 503, json: { error: 'Please retry.' } });
    }
    return route.fulfill({ json: sample(Number(after.split('-')[1]) + 1) });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Retry loading proposals' })).toBeAttached();
  fail = false;
  const failedRequests = requested.length;
  // Retry at the top so the ready batch must remain buffered until scrolling.
  await page
    .getByRole('button', { name: 'Retry loading proposals' })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect.poll(() => requested.length).toBe(failedRequests + 1);
  expect(requested.every((cursor) => cursor === 'sample-0')).toBe(true);
  await expect(page.getByRole('heading', { name: 'Proposal 1-0', exact: true })).toHaveCount(0);
  await page.getByText('Scroll to discover more proposals.').scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'Proposal 1-0', exact: true })).toBeVisible();
  await expect.poll(() => requested.length).toBe(failedRequests + 2);
  await expect(page.getByRole('heading', { name: 'Proposal 2-0', exact: true })).toHaveCount(0);
  await expect(page.locator('.cumulative-wallet')).toContainText('100 coins left');
  await expect(page.getByRole('button', { name: 'Next random sample' })).toHaveCount(0);
});

test('catalog appends projects on scroll and resets when filters change', async ({ page }) => {
  await mockRound(page);
  const requests: URL[] = [];
  await page.route('**/api/suggestions?**', (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const number = Number(url.searchParams.get('page'));
    const filtered = url.searchParams.has('district');
    return route.fulfill({
      json: {
        items: Array.from({ length: 12 }, (_, i) => ({
          id: (filtered ? 'filtered-' : '') + number + '-' + i,
          title: (filtered ? 'Filtered ' : 'Catalog ') + number + '-' + i,
          description: 'A proposal for the community.',
          district: 'City-wide',
          district_id: 1,
          categories: [],
          cost: 500,
          has_image: false,
        })),
        nextPage: number === 1 && !filtered ? 2 : null,
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  const catalog = page.getByRole('region', { name: 'Community ideas' });
  await expect(catalog.getByRole('heading', { name: 'Catalog 1-0', exact: true })).toBeVisible();
  await expect(catalog.getByRole('button', { name: 'Next', exact: true })).toHaveCount(0);
  await catalog.getByText('Scroll to discover more proposals.').scrollIntoViewIfNeeded();
  await expect(catalog.locator('.project-card')).toHaveCount(24);
  await expect(catalog.getByText('You’ve reached the end of these proposals.')).toBeVisible();
  await catalog.getByRole('combobox', { name: 'District', exact: true }).selectOption('1');
  await expect(catalog.locator('.project-card')).toHaveCount(12);
  await expect(catalog.getByRole('heading', { name: 'Catalog 1-0', exact: true })).toHaveCount(0);
  expect(requests.at(-1)?.searchParams.get('page')).toBe('1');
});

test('achievement collection shows earned badges and locked progress on a small phone', async ({
  page,
}) => {
  await mockRound(page);
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.route('**/api/account/achievements', (route) =>
    route.fulfill({
      json: {
        totalVotes: 5,
        district: null,
        category: null,
        badges: [
          { id: 'first-look', earned: true, current: 1, target: 1 },
          { id: 'halfway', earned: false, current: 20, target: 26 },
          { id: 'completionist', earned: false, current: 20, target: 50 },
          { id: 'penny-parade', earned: true, current: 5, target: 5 },
        ],
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Account · mobiletester' }).click();
  const collection = page.getByRole('region', { name: 'Achievement collection' });
  await expect(collection.locator('article')).toHaveCount(14);
  await expect(collection.getByRole('article', { name: 'Penny Parade' })).toContainText('Earned');
  await expect(collection.getByRole('article', { name: 'Over the Horizon' })).toContainText(
    'Locked',
  );
  await expect(
    collection.getByRole('progressbar', { name: 'Over the Horizon progress' }),
  ).toHaveAttribute('value', '20');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await collection.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.local/achievements-mobile.png' });
});

test('new achievements celebrate in order without replay and respect reduced motion', async ({
  page,
}) => {
  await mockRound(page);
  let earned = ['first-look'];
  let checks = 0;
  await page.route('**/api/account/achievements', (route) => {
    checks++;
    return route.fulfill({
      json: {
        totalVotes: 0,
        district: null,
        category: null,
        badges: earned.map((id) => ({ id, earned: true, current: 1, target: 1 })),
      },
    });
  });
  await page.goto('/');
  await expect.poll(() => checks).toBeGreaterThan(0);
  await expect(page.locator('.achievement-celebration')).toHaveCount(0);
  earned = ['first-look', 'halfway', 'completionist'];
  await page.evaluate(() => window.dispatchEvent(new Event('participation-achievements-changed')));
  const popup = page.locator('.achievement-celebration');
  await expect(popup).toContainText('Over the Horizon');
  await expect(popup).toHaveCSS('animation-name', 'achievement-arrival');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.local/achievement-unlock-mobile.png' });
  await popup.getByRole('button', { name: 'Dismiss achievement' }).click();
  await expect(popup).toContainText('Completionist');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(popup).toHaveCSS('animation-name', 'none');
  await expect(popup.locator('.achievement-confetti')).toBeHidden();
  await popup.getByRole('button', { name: 'Dismiss achievement' }).click();
  const before = checks;
  await page.evaluate(() => window.dispatchEvent(new Event('participation-achievements-changed')));
  await expect.poll(() => checks).toBeGreaterThan(before);
  await expect(popup).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Account · mobiletester' })).toBeVisible();
  await expect(popup).toHaveCount(0);
});

test('partial confirmation leaves coins spendable and only locks confirmed allocations', async ({
  page,
}) => {
  await mockRound(page);
  let coins = 0,
    confirmed = 0,
    revision = 0,
    checkoutRevision = -1;
  const proposal = {
    id: 'partial-project',
    title: 'One coin, more to come',
    description: 'A community idea.',
    district: 'City-wide',
    district_id: 1,
    categories: [],
    cost: 500,
    has_image: false,
  };
  const state = () => ({
    revision,
    checkoutRevision,
    coins: coins ? { [proposal.id]: coins } : {},
    confirmed: confirmed ? { [proposal.id]: confirmed } : {},
  });
  await page.route('**/api/ballots/next', (route) =>
    route.fulfill({
      json: {
        id: 'partial',
        method: 'cumulative',
        completed: 0,
        remainingPoints: 100 - coins,
        suggestions: [proposal],
      },
    }),
  );
  await page.route('**/api/cumulative/next', (route) =>
    route.fulfill({
      json: {
        id: '',
        method: 'cumulative',
        completed: 0,
        remainingPoints: 100 - coins,
        suggestions: [],
        finished: 'ideas-exhausted',
      },
    }),
  );
  await page.route('**/api/cumulative/cart', (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      expect(body.coins).toBeGreaterThanOrEqual(confirmed);
      coins = body.coins;
      revision++;
    }
    return route.fulfill({ json: state() });
  });
  await page.route('**/api/cumulative/checkout', (route) => {
    if (route.request().method() === 'POST') {
      confirmed = coins;
      checkoutRevision = revision;
      return route.fulfill({ json: state() });
    }
    return route.fulfill({ json: { cart: state(), projects: [{ ...proposal, available: true }] } });
  });
  await page.route('**/api/account/cumulative-votes', (route) =>
    route.fulfill({
      json: confirmed ? [{ ...proposal, coins: confirmed, votes: Math.sqrt(confirmed) }] : [],
    }),
  );
  await page.goto('/');
  const add = page.getByRole('button', {
    name: 'Add coins for the next vote to One coin, more to come',
  });
  const remove = page.getByRole('button', { name: 'Remove 1 vote from One coin, more to come' });
  await add.click();
  await expect(page.locator('.cumulative-wallet')).toContainText('99 coins left');
  await page.getByRole('button', { name: 'Overview & confirm', exact: true }).first().click();
  await page.getByRole('button', { name: 'Confirm funding', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue voting' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Continue voting' }).click();
  await expect(remove).toHaveAttribute('aria-disabled', 'true');
  await add.click();
  await expect(page.locator('.cumulative-wallet')).toContainText('96 coins left');
  await remove.click();
  await expect(page.locator('.cumulative-wallet')).toContainText('99 coins left');
  await expect(remove).toHaveAttribute('aria-disabled', 'true');
  await add.click();
  await page.getByRole('button', { name: 'Overview & confirm', exact: true }).first().click();
  await page.getByRole('button', { name: 'Confirm funding', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Your votes' })).toContainText('2 votes');
  await expect(page.locator('.cumulative-wallet')).toContainText('96 coins left');
});

test('five consecutive account clicks unlock a hidden badge and open the music video', async ({
  page,
}) => {
  await mockRound(page);
  let unlocked = false,
    awards = 0;
  await page.route('**/api/account/achievements', (route) =>
    route.fulfill({
      json: {
        totalVotes: 0,
        district: null,
        category: null,
        badges: unlocked
          ? [{ id: 'never-gonna-give-you-up', earned: true, current: 1, target: 1 }]
          : [],
      },
    }),
  );
  await page.route('**/api/account/secret', (route) => {
    awards++;
    unlocked = true;
    return route.fulfill({ json: { unlocked: true } });
  });
  await page.route('https://www.youtube.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Music reward destination</h1>' }),
  );
  await page.goto('/');
  const account = page.getByRole('button', { name: 'Account · mobiletester' });
  await account.click();
  await account.click();
  await expect(
    page.getByRole('article', { name: 'Never Gonna Give You Up', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  for (let n = 0; n < 4; n++) await account.click();
  expect(awards).toBe(0);
  await account.click();
  await expect.poll(() => awards).toBe(1);
  await expect(page.locator('.achievement-celebration')).toContainText('Never Gonna Give You Up');
  await expect(page).toHaveURL('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.goto('/');
  await account.click();
  await expect(
    page.getByRole('article', { name: 'Never Gonna Give You Up', exact: true }),
  ).toContainText('Earned');
});

test('compact Explore keeps filters across list/map and exposes ideas above the fold', async ({
  page,
}) => {
  await mockRound(page);
  await page.route('**/api/account', (route) => route.fulfill({ json: { account: null } }));
  await page.route('https://www.openstreetmap.org/**', (route) =>
    route.fulfill({ body: 'Map provider', contentType: 'text/html' }),
  );
  await page.goto('/');
  const first = page.locator('.compact-project').first();
  await expect(first).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await first.boundingBox())!.y).toBeLessThan(670);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const district = page.getByRole('combobox', { name: 'District', exact: true });
  await district.selectOption('4');
  const category = page
    .locator('.category-chips')
    .getByRole('button', { name: 'Community', exact: true });
  await category.click();
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Zürich map' })).toContainText(
    'no project pins are shown',
  );
  await expect(district).toHaveValue('4');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(category).toHaveAttribute('aria-pressed', 'true');
  await first.getByRole('button', { name: /View idea:/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Residents can help shape this idea');
  await page.keyboard.press('Escape');
  await expect(first.getByRole('button', { name: /View idea:/ })).toBeFocused();
  await page.getByRole('button', { name: 'Suggest an idea', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.idea-composer')).toHaveCount(0);
});

test('suggest action opens the existing form and preserves the submission payload', async ({
  page,
}) => {
  await mockRound(page);
  await page.route('**/api/overview', (route) =>
    route.fulfill({ json: { phase: 'suggestions', suggestionCount: 3, ballotCount: 0 } }),
  );
  let payload = '';
  await page.route('**/api/suggestions', (route) => {
    if (route.request().method() === 'POST') payload = route.request().postData() ?? '';
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/');
  await expect(page.locator('.suggestion-form')).toHaveCount(0);
  await page.getByRole('button', { name: 'Suggest an idea', exact: true }).click();
  const form = page.locator('.suggestion-form');
  await expect(form).toBeVisible();
  await form.getByLabel('Estimated project cost (CHF)').fill('3400');
  await form.getByLabel('Give your idea a name').fill('A shared neighbourhood garden');
  await form
    .locator('textarea')
    .fill('Raised planters for neighbours to grow seasonal vegetables together.');
  await form.getByLabel('Where would it happen?').selectOption('4');
  await form.getByRole('checkbox', { name: 'Community', exact: true }).check();
  await form.getByRole('button', { name: 'Share your idea' }).click();
  await expect(form.getByRole('status')).toContainText('Your idea has been submitted');
  expect(payload).toContain('3400');
  expect(payload).toContain('A shared neighbourhood garden');
  expect(payload).toContain('districtId');
});

test('Impact shows confirmed selection without inventing project delivery updates', async ({
  page,
}) => {
  await mockRound(page);
  await page.route('**/api/overview', (route) =>
    route.fulfill({ json: { phase: 'results', suggestionCount: 1, ballotCount: 12 } }),
  );
  await page.route('**/api/results?**', (route) =>
    route.fulfill({
      json: {
        method: 'approval',
        nextPage: null,
        items: [
          {
            id: 'impact-1',
            title: 'A shared neighbourhood garden',
            description: 'Neighbours grow food together.',
            district: 'Kreis 4',
            district_id: 4,
            categories: [{ id: 2, name: 'Environment' }],
            has_image: false,
            cost: 3400,
            rank: 1,
            score: 80,
            appearances: 12,
          },
        ],
      },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'View details of A shared neighbourhood garden' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Selected by the community');
  await expect(dialog.getByText('No update published.', { exact: true })).toHaveCount(3);
  await expect(dialog).toContainText('Selection does not confirm that work has started.');
  await page.screenshot({ path: '.local/impact-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '.local/impact-desktop.png' });
});
