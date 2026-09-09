import { test, expect, type Page } from '@playwright/test';
import { defaultSampling } from '../src/server/voting/sampling';

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
  await expect(page.getByRole('heading', { name: 'Explore community ideas' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Beetee’s universal charging cable' }),
  ).toBeVisible();
  await expect(page.locator('.district-picker')).toHaveCount(0);
  await page.getByRole('button', { name: /Have your say/ }).click();
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
  const round = await page.locator('.round-header').boundingBox();
  expect(header!.y + header!.height).toBeLessThanOrEqual(round!.y);
  await page.screenshot({ path: '.local/account-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in to vote' })).toBeVisible();
  await expect(page.locator('.swipe-card')).toHaveCount(0);
});

test('cumulative phone wallet charges squares, carries remaining points and finishes at zero', async ({
  page,
}) => {
  await mockRound(page);
  let remaining = 100,
    batch = 0;
  const cards = () =>
    Array.from({ length: 3 }, (_, i) => ({
      id: 'c' + batch + '-' + i,
      title: 'Cumulative idea ' + i,
      description: 'An idea for the community.',
      district: 'City-wide',
      district_id: 13,
      has_image: false,
      categories: [{ id: 1, name: 'Community' }],
      cost: 10000,
    }));
  await page.route('**/api/ballots/next', (route) =>
    route.fulfill({
      json: {
        id: 'c' + batch,
        method: 'cumulative',
        suggestions: remaining ? cards() : [],
        remainingPoints: remaining,
        completed: batch,
        ...(!remaining ? { finished: 'budget-exhausted' } : {}),
      },
    }),
  );
  await page.route('**/api/votes', async (route) => {
    const entries = route.request().postDataJSON().entries as { value: number }[];
    const cost = entries.reduce((n, e) => n + e.value * e.value, 0);
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThanOrEqual(remaining);
    remaining -= cost;
    batch++;
    await route.fulfill({ json: { accepted: true } });
  });
  await page.goto('/');
  await expect(page.locator('.cumulative-wallet')).toContainText('100 points left');
  await expect(page.getByRole('button', { name: 'Confirm & next batch' })).toBeDisabled();
  const add = page.getByRole('button', { name: 'Add a vote to Cumulative idea 0', exact: true });
  await add.click();
  await add.click();
  await add.click();
  await expect(page.locator('.cumulative-wallet')).toContainText('91 points left');
  await expect(page.locator('.quadratic-controls').first()).toContainText('3 votes · 9 points');
  await page.getByRole('button', { name: 'Remove a vote from Cumulative idea 0' }).click();
  await expect(page.locator('.cumulative-wallet')).toContainText('96 points left');
  await page.getByRole('button', { name: 'Confirm & next batch' }).click();
  await expect.poll(() => remaining).toBe(96);
  await expect(page.locator('.quadratic-controls').first()).toContainText('0 votes');
  // 8²+4²+4² consumes the remaining 96.
  for (let i = 0; i < 3; i++)
    for (let n = 0; n < (i === 0 ? 8 : 4); n++)
      await page
        .getByRole('button', { name: 'Add a vote to Cumulative idea ' + i, exact: true })
        .click();
  await expect(page.locator('.cumulative-wallet')).toContainText('0 points left');
  await expect(
    page.getByRole('button', { name: 'Add a vote to Cumulative idea 0', exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const wallet = await page.locator('.cumulative-wallet strong').boundingBox();
  expect(wallet!.y).toBeGreaterThanOrEqual(0);
  expect(wallet!.y + wallet!.height).toBeLessThan(844);
  await page.screenshot({ path: '.local/cumulative-mobile.png' });
  await page.getByRole('button', { name: 'Confirm final votes' }).click();
  await expect(page.getByRole('heading', { name: 'All 100 points put to work.' })).toBeVisible();
  expect(remaining).toBe(0);
});
