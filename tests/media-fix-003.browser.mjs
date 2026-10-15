import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = process.env.WAAGD_FRONTEND_BASE ?? 'http://127.0.0.1:8787';
const output = 'output/playwright/media-fix-003';
mkdirSync(output, { recursive: true });
const modulePath =
  process.env.WAAGD_PLAYWRIGHT_MODULE ??
  readdirSync(join(homedir(), '.npm/_npx'))
    .map((entry) =>
      join(homedir(), '.npm/_npx', entry, 'node_modules/playwright/index.mjs'),
    )
    .find(existsSync);
assert.ok(modulePath, 'Install the documented external Playwright tooling');
const engines = await import(pathToFileURL(modulePath).href);
const repeats = Number(process.env.WAAGD_FOCUS_REPEATS ?? 3);
assert.ok(Number.isInteger(repeats) && repeats > 0);
const results = [];
const url = 'https://www.reddit.com/r/test/comments/abc123/';
const post = (n = 1) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  type: 'video',
  origin: 'telegram',
  url,
  canonical_url: null,
  source_item_id: null,
  title: `Reddit focus ${n}`,
  source: 'Reddit',
  preview: null,
  embed: { kind: 'provider', provider: 'reddit', url, id: 'abc123' },
  body: null,
  references: [],
  published_at: '2026-10-12T00:00:00.000Z',
  deleted_at: null,
});
const gate = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const frames = (page) => page.locator('.reddit iframe');
const settings = (page) =>
  page.getByRole('button', { name: 'External content settings', exact: true });
const allow = (page) =>
  page.getByRole('button', { name: 'ALLOW EXTERNAL CONTENT', exact: true });
const decline = (page) =>
  page.getByRole('button', {
    name: 'CONTINUE WITHOUT EXTERNAL CONTENT',
    exact: true,
  });
const dialog = (page) =>
  page.getByRole('dialog', { name: 'EXTERNAL CONTENT', exact: true });
const focused = (locator) =>
  locator.evaluate((node) => document.activeElement === node);
const turn = (page) =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );

async function fixture(browser, width, { pending = false, status = 200 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const navigation = gate(),
    requested = gate();
  let fullRequests = 0;
  await page.route('**/api/posts?*', (route) =>
    route.fulfill({
      json: { ok: true, data: { posts: [post()], next_cursor: null } },
    }),
  );
  await page.route('https://embed.reddit.com/**', async (route) => {
    const summary =
      new URL(route.request().url()).searchParams.get('showmedia') === 'false';
    if (!summary) {
      fullRequests++;
      requested.resolve();
      if (pending) await navigation.promise;
    }
    await route
      .fulfill({
        status: summary ? 200 : status,
        contentType: 'text/html',
        body: `<main><p>${summary ? 'Summary without media' : 'Full provider content'}</p><button>Provider control</button><a href="https://www.reddit.com/">Provider original</a></main>`,
      })
      .catch(() => {});
  });
  await page.goto(base);
  await allow(page).click();
  const media = page.locator('.media.reddit'),
    frame = frames(page),
    play = page.locator('.reddit-play');
  await frame.waitFor();
  const provider = await (await frame.elementHandle()).contentFrame();
  await provider.getByRole('button', { name: 'Provider control' }).waitFor();
  assert.equal(await provider.locator('video,audio').count(), 0);
  assert.ok(Math.abs((await media.boundingBox()).height - 300) < 0.001);
  await play.focus();
  return {
    context,
    page,
    media,
    frame,
    play,
    provider,
    navigation,
    requested,
    fullRequests: () => fullRequests,
  };
}

async function activate(f, activation) {
  const before = await f.page.evaluate(() => scrollY);
  const top = (await f.media.boundingBox()).y;
  if (activation === 'mouse') await f.play.click();
  else await f.page.keyboard.press(activation);
  await f.requested.promise;
  assert.ok(Math.abs((await f.media.boundingBox()).height - 620) < 0.001);
  assert.equal(await f.play.count(), 0);
  assert.equal(await f.frame.count(), 1);
  assert.ok(
    Math.abs((await f.page.evaluate(() => scrollY)) - before) <= 1,
    'Activation preserves scroll',
  );
  assert.ok(
    Math.abs((await f.media.boundingBox()).y - top) <= 1,
    'Activated card stays anchored',
  );
  return { before, top };
}

async function loaded(f) {
  await f.provider.waitForURL((u) => !u.searchParams.has('showmedia'), {
    waitUntil: 'load',
  });
  await f.provider.getByRole('button', { name: 'Provider control' }).waitFor();
}

async function providerPath(f) {
  // macOS WebKit's default keyboard mode uses Option-Tab for buttons/links
  // (Apple Safari shortcuts). Other tested engines use plain Tab throughout.
  // No OS preference or provider DOM is changed to obtain control navigation.
  const controlTab =
    process.platform === 'darwin' &&
    f.page.context().browser().browserType().name() === 'webkit'
      ? 'Alt+Tab'
      : 'Tab';
  await f.page.keyboard.press(controlTab);
  assert.equal(
    await focused(f.frame),
    true,
    'The next native keyboard navigation stays in the activated provider path',
  );
  for (
    let i = 0;
    i < 2 &&
    !(await focused(
      f.provider.getByRole('button', { name: 'Provider control' }),
    ));
    i++
  )
    await f.page.keyboard.press(controlTab);
  assert.equal(
    await focused(f.provider.getByRole('button', { name: 'Provider control' })),
    true,
    'Native Tab reaches provider controls without programmatic provider focus',
  );
}

async function focusCase(browser, width, activation, scenario) {
  const f = await fixture(browser, width, {
    pending: scenario !== 'normal',
    status: scenario === 'unavailable' ? 403 : 200,
  });
  try {
    const position = await activate(f, activation);
    if (scenario !== 'normal') {
      assert.equal(await f.media.getAttribute('role'), 'group');
      assert.equal(
        await f.media.getAttribute('aria-label'),
        'Reddit: Reddit focus 1',
      );
      assert.equal(
        await focused(f.media),
        true,
        'Stable host anchor retains focus during pending navigation',
      );
      if (scenario === 'move-away') {
        const destination = f.page.locator('.embed-hint a');
        await destination.focus();
        f.navigation.resolve();
        await loaded(f);
        await turn(f.page);
        assert.equal(
          await focused(destination),
          true,
          'Navigation does not steal focus after user movement',
        );
        return;
      }
      if (scenario === 'revoke') {
        await settings(f.page).focus();
        await f.page.keyboard.press('Enter');
        await dialog(f.page).waitFor();
        await decline(f.page).click();
        const requestCount = f.fullRequests();
        f.navigation.resolve();
        await turn(f.page);
        assert.equal(
          await frames(f.page).count(),
          0,
          'Revocation removes pending frame',
        );
        assert.equal(await f.media.getAttribute('tabindex'), null);
        assert.equal(
          await focused(settings(f.page)),
          true,
          'Revocation restores settings focus',
        );
        await settings(f.page).click();
        await allow(f.page).click();
        await f.media.scrollIntoViewIfNeeded();
        await frames(f.page).waitFor();
        await turn(f.page);
        assert.equal(
          new URL(await frames(f.page).getAttribute('src')).searchParams.get(
            'showmedia',
          ),
          'false',
        );
        assert.equal(
          f.fullRequests(),
          requestCount,
          'Reallow never restores full-content activation',
        );
        return;
      }
      if (scenario === 'tab-pending') await providerPath(f);
      f.navigation.resolve();
    }
    await loaded(f);
    if (width === 390 && activation === 'Enter' && scenario === 'normal')
      await f.page.screenshot({
        path: `${output}/${browser.browserType().name()}-expanded.png`,
      });
    assert.equal(
      await focused(f.frame),
      true,
      'Load retains/transfers focus to the official frame',
    );
    // These delays observe persistence; application correctness uses no timer.
    for (const ms of [100, 500]) {
      await f.page.waitForTimeout(ms);
      assert.equal(
        await focused(f.frame),
        true,
        `Focus survives ${ms}ms sample`,
      );
    }
    assert.ok(
      Math.abs((await f.page.evaluate(() => scrollY)) - position.before) <= 1,
    );
    assert.equal(
      f.fullRequests(),
      1,
      'Exactly one full navigation per trusted activation',
    );
    if (scenario !== 'tab-pending') await providerPath(f);
    await f.page.reload();
    await frames(f.page).waitFor();
    assert.equal(
      new URL(await frames(f.page).getAttribute('src')).searchParams.get(
        'showmedia',
      ),
      'false',
      'Reload resets full-content activation',
    );
  } finally {
    f.navigation.resolve();
    await f.context.close();
  }
}

async function consentCase(browser, mode) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const pagination = gate(),
    requested = gate();
  let external = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(base).origin) external++;
  });
  await page.route('**/api/posts?*', async (route) => {
    const later = new URL(route.request().url()).searchParams.has('cursor');
    if (later) {
      requested.resolve();
      await pagination.promise;
    }
    await route
      .fulfill({
        json: {
          ok: true,
          data: {
            posts: later ? [post(2), post(3), post(4)] : [post()],
            next_cursor: later ? null : 'next',
          },
        },
      })
      .catch(() => {});
  });
  await page.route('https://embed.reddit.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<button>Provider control</button>',
    }),
  );
  try {
    await page.goto(`${base}/privacy`);
    await page.evaluate(() =>
      sessionStorage.setItem('waagd.external-content', 'decline'),
    );
    await page.goto(base);
    await page.reload();
    await page.locator('.post').first().waitFor();
    assert.equal(await dialog(page).isVisible(), false);
    assert.equal(external, 0, 'Decline/reload makes no external requests');
    await settings(page).scrollIntoViewIfNeeded();
    await requested.promise;
    const box = await settings(page).boundingBox();
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    if (mode === 'keyboard') {
      await settings(page).focus();
      await page.keyboard.press('Enter');
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      if (mode === 'cancel') await page.mouse.move(2, 2);
    }
    pagination.resolve();
    await page.locator('#feed-sentinel[data-state="end"]').waitFor();
    const after = await settings(page).boundingBox();
    assert.ok(
      Math.abs(after.y - box.y) > 100,
      'Real pagination moves the footer during the gesture',
    );
    if (mode !== 'keyboard') await page.mouse.up();
    if (mode === 'cancel') {
      assert.equal(
        await dialog(page).isVisible(),
        false,
        'Deliberately dragging away cancels settings',
      );
      await settings(page).focus();
      await page.keyboard.press('Space');
    }
    await dialog(page).waitFor();
    if (mode === 'pointer')
      await page.screenshot({
        path: `${output}/${browser.browserType().name()}-consent-pagination.png`,
      });
    assert.equal(
      external,
      0,
      'Opening settings while declined loads no external content',
    );
    assert.equal(
      await focused(decline(page)),
      true,
      'Visible modal is keyboard operable',
    );
    // Establish and measure the same lazy-loading distance as the existing suite.
    await page.evaluate(() => scrollTo(0, 0));
    await turn(page);
    await allow(page).click();
    await page.locator('.media.reddit').first().scrollIntoViewIfNeeded();
    await frames(page).first().waitFor();
    assert.equal(
      await page.evaluate(() =>
        sessionStorage.getItem('waagd.external-content'),
      ),
      'allow',
    );
    await settings(page).focus();
    await page.keyboard.press('Enter');
    await dialog(page).waitFor();
    await decline(page).click();
    assert.equal(
      await frames(page).count(),
      0,
      'Revoke unloads all frames after pagination',
    );
    const count = external;
    await turn(page);
    assert.equal(
      external,
      count,
      'No further external requests after revocation',
    );
    await page.reload();
    await page.locator('.post').first().waitFor();
    await turn(page);
    assert.equal(
      external,
      count,
      'Reload preserves decline without provider requests',
    );
  } finally {
    pagination.resolve();
    await context.close();
  }
}

for (const name of (
  process.env.WAAGD_BROWSERS ?? 'chromium,firefox,webkit'
).split(',')) {
  let browser;
  const result = {
    name,
    platform: process.platform,
    status: 'FAIL',
    cases: [],
  };
  results.push(result);
  try {
    assert.ok(
      name !== 'firefox' || process.platform === 'linux',
      'Firefox acceptance requires Linux',
    );
    browser = await engines[name].launch();
    result.version = browser.version();
    for (let repeat = 1; repeat <= repeats; repeat++)
      for (const width of [320, 390, 1440])
        for (const activation of ['Enter', 'Space', 'mouse']) {
          await focusCase(browser, width, activation, 'normal');
          result.cases.push({ repeat, width, activation, scenario: 'normal' });
        }
    for (const activation of ['Enter', 'Space', 'mouse'])
      for (const scenario of [
        'delayed',
        'move-away',
        'revoke',
        'tab-pending',
        'unavailable',
      ]) {
        await focusCase(browser, 390, activation, scenario);
        result.cases.push({ width: 390, activation, scenario });
      }
    for (const mode of ['pointer', 'keyboard', 'cancel']) {
      await consentCase(browser, mode);
      result.cases.push({ scenario: 'consent-pagination', mode });
    }
    result.status = 'PASS';
  } catch (error) {
    result.error = String(error);
    result.stack = error.stack;
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
  writeFileSync(`${output}/${name}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, cases: result.cases.length }));
}
