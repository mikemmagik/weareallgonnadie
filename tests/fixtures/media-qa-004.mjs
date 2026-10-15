// Independent QA-only fixture. Uses built assets and local routed provider documents.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
const output = resolve('output/playwright/media-qa-004');
await mkdir(output, { recursive: true });
const engines = await import(
  pathToFileURL(process.env.WAAGD_PLAYWRIGHT_MODULE).href
);
const headers = Object.fromEntries(
  (await readFile('public/_headers', 'utf8'))
    .split('\n')
    .filter((x) => x.startsWith('  '))
    .map((x) => {
      const i = x.indexOf(':');
      return [x.slice(0, i).trim(), x.slice(i + 1).trim()];
    }),
);
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve('dist', `.${p}${extname(p) ? '' : '/index.html'}`);
    assert.ok(file.startsWith(resolve('dist') + '/'));
    const body = await readFile(file);
    res.writeHead(200, {
      ...headers,
      'Content-Type':
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
        }[extname(file)] ?? 'application/octet-stream',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const gate = () => {
  let release;
  const promise = new Promise((r) => (release = r));
  return { promise, release };
};
const url = 'https://www.reddit.com/r/qa/comments/abc123/';
const post = (n) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  type: 'video',
  origin: 'telegram',
  url,
  canonical_url: null,
  source_item_id: null,
  title: `Independent QA ${n}`,
  source: 'Reddit',
  preview: null,
  embed: { kind: 'provider', provider: 'reddit', url, id: 'abc123' },
  body: null,
  references: [],
  published_at: '2026-10-15T00:00:00.000Z',
  deleted_at: null,
});
const settings = (p) => p.locator('[data-external-settings]');
const dialog = (p) => p.locator('#external-content-dialog');
const choice = (p, c) => p.locator(`[data-external-choice="${c}"]`);
const focused = (l) => l.evaluate((n) => document.activeElement === n);
const height = (l) => l.evaluate((n) => n.getBoundingClientRect().height);
const settle = (p) =>
  p.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
async function snapshot(p, label, record) {
  record.observations ??= [];
  record.observations.push({
    label,
    ...(await p.evaluate(() => ({
      active: document.activeElement?.tagName,
      className: document.activeElement?.className,
      scrollY,
      dialogOpen: document.querySelector('dialog')?.open,
      frames: document.querySelectorAll('iframe').length,
      consent: sessionStorage.getItem('waagd.external-content'),
    }))),
  });
}
async function runCase(browser, name, fn) {
  const record = { name, status: 'RUNNING' };
  results.push(record);
  const context = await browser.newContext({
    viewport: { width: 390, height: 1000 },
    hasTouch: browser.browserType().name() === 'chromium',
  });
  const p = await context.newPage();
  p.setDefaultTimeout(7000);
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  try {
    await fn(p, record, context);
    assert.deepEqual(errors, []);
    record.status = 'PASS';
  } catch (e) {
    record.status = 'FAIL';
    record.error = String(e);
    record.stack = e.stack;
    process.exitCode = 1;
    await snapshot(p, 'failure', record).catch(() => {});
    await p
      .screenshot({
        path: `${output}/${engine}-${name}-failure.png`,
        fullPage: true,
      })
      .catch(() => {});
  } finally {
    await context.tracing.stop({ path: `${output}/${engine}-${name}.zip` });
    await context.close();
    await writeFile(
      `${output}/${engine}.json`,
      JSON.stringify(
        {
          engine,
          version: browser.version(),
          platform: process.platform,
          results,
        },
        null,
        2,
      ),
    );
    console.log(`${engine}: ${name} ${record.status}`);
  }
}
async function focusChallenge(p, record, activation, mode) {
  const release = gate(),
    requested = gate();
  let full = 0,
    summary = 0;
  await p.route('**/api/posts?*', (r) =>
    r.fulfill({
      json: { ok: true, data: { posts: [post(1)], next_cursor: null } },
    }),
  );
  await p.route('https://embed.reddit.com/**', async (r) => {
    const collapsed =
      new URL(r.request().url()).searchParams.get('showmedia') === 'false';
    if (collapsed) summary++;
    else {
      full++;
      requested.release();
      if (mode !== 'immediate') await release.promise;
    }
    await r
      .fulfill({
        status: !collapsed && mode === '403' ? 403 : 200,
        contentType: 'text/html',
        body:
          !collapsed && mode === '403'
            ? '<h1>Provider access denied</h1>'
            : '<p>Local independent provider fixture</p><button>Independent provider action</button><a href="https://www.reddit.com/">Original</a>',
      })
      .catch(() => {});
  });
  try {
    await p.goto(base);
    await choice(p, 'allow').click();
    const media = p.locator('.media.reddit'),
      frame = media.locator('iframe'),
      play = media.locator('button');
    await frame.waitFor();
    await media.scrollIntoViewIfNeeded();
    const child = await (await frame.elementHandle()).contentFrame();
    await child
      .getByRole('button', { name: 'Independent provider action' })
      .waitFor();
    assert.equal(await height(media), 300);
    assert.equal(full, 0);
    assert.equal(summary, 1);
    assert.equal(await child.locator('video,audio').count(), 0);
    await play.evaluate((n) => n.click());
    assert.equal(full, 0);
    assert.equal(await height(media), 300);
    await frame.evaluate((n) => {
      window.qaOriginalFrame = n;
    });
    await play.focus();
    const scroll = await p.evaluate(() => scrollY);
    if (activation === 'mouse') await play.click();
    else await p.keyboard.press(activation);
    await requested.promise;
    assert.equal(await height(media), 620);
    assert.equal(await frame.count(), 1);
    assert.equal(await play.count(), 0);
    await snapshot(p, 'activated', record);
    if (mode !== 'immediate') assert.equal(await focused(media), true);
    if (mode === 'away') {
      await p.locator('.embed-hint a').focus();
    }
    if (mode === 'settings' || mode === 'revoke') {
      await settings(p).focus();
      await p.keyboard.press('Enter');
      await dialog(p).waitFor({ state: 'visible' });
      assert.equal(await focused(choice(p, 'decline')), true);
    }
    if (mode === 'revoke') {
      await choice(p, 'decline').click();
      assert.equal(await frame.count(), 0);
      assert.equal(await height(media), 300);
      assert.equal(await media.getAttribute('tabindex'), null);
    }
    const loaded = p.waitForEvent('framenavigated', {
      predicate: (f) =>
        f !== p.mainFrame() &&
        f.url().startsWith('https://embed.reddit.com/') &&
        !new URL(f.url()).searchParams.has('showmedia'),
    });
    if (mode !== 'immediate') release.release();
    if (mode === 'revoke') {
      // Removed browsing contexts cannot navigate; do not await that event.
      loaded.catch(() => {});
      await settle(p);
      assert.equal(await frame.count(), 0);
      assert.equal(await focused(settings(p)), true);
      await settings(p).click();
      await choice(p, 'allow').click();
      await media.scrollIntoViewIfNeeded();
      await frame.waitFor();
      assert.equal(
        new URL(await frame.getAttribute('src')).searchParams.get('showmedia'),
        'false',
      );
      assert.equal(full, 1);
    } else {
      // waitForURL also covers immediate navigation that completed before observer setup.
      loaded.catch(() => {});
      await child.waitForURL((u) => !u.searchParams.has('showmedia'), {
        waitUntil: 'load',
      });
      await settle(p);
      for (const delay of [0, 150, 600]) {
        if (delay) await p.waitForTimeout(delay);
        await snapshot(p, `loaded-${delay}`, record);
        if (mode === 'away')
          assert.equal(await focused(p.locator('.embed-hint a')), true);
        else if (mode === 'settings')
          assert.equal(await focused(choice(p, 'decline')), true);
        else assert.equal(await focused(frame), true);
      }
      if (mode === 'settings') {
        await p.locator('.embed-hint a').evaluate((n) => n.focus());
        assert.equal(
          await focused(choice(p, 'decline')),
          true,
          'Background remains inert',
        );
        await p.keyboard.press('Escape');
        assert.equal(await frame.count(), 0);
        assert.equal(await focused(settings(p)), true);
      } else {
        assert.equal(
          await frame.evaluate((n) => n === window.qaOriginalFrame),
          true,
        );
        if (mode !== 'away')
          assert.ok(Math.abs((await p.evaluate(() => scrollY)) - scroll) <= 1);
        const denied = await child.evaluate(() => {
          try {
            return !parent.document;
          } catch (e) {
            return e.name === 'SecurityError';
          }
        });
        assert.equal(denied, true);
        assert.equal(
          await frame.getAttribute('sandbox'),
          'allow-scripts allow-same-origin allow-popups',
        );
        assert.ok(
          (await frame.getAttribute('allow')).includes("autoplay 'none'"),
        );
        if (mode !== '403' && mode !== 'away') {
          const key =
            process.platform === 'darwin' && engine === 'webkit'
              ? 'Alt+Tab'
              : 'Tab';
          for (
            let n = 0;
            n < 3 &&
            !(await focused(
              child.getByRole('button', {
                name: 'Independent provider action',
              }),
            ));
            n++
          )
            await p.keyboard.press(key);
          assert.equal(
            await focused(
              child.getByRole('button', {
                name: 'Independent provider action',
              }),
            ),
            true,
          );
          record.providerKeyboard = key;
        }
        assert.equal(
          await p.locator('.embed-hint a').getAttribute('href'),
          url,
        );
        await settings(p).focus();
        await p.keyboard.press('Enter');
        await choice(p, 'decline').click();
        assert.equal(await frame.count(), 0);
      }
    }
    assert.equal(full, 1);
    await p.reload();
    await p.locator('.post').waitFor();
    await settle(p);
    // Revoke challenge reallowed explicitly; other scenarios end with decline.
    if (mode !== 'revoke') {
      assert.equal(await p.locator('iframe').count(), 0);
      assert.equal(await dialog(p).isVisible(), false);
    } else {
      await media.scrollIntoViewIfNeeded();
      await frame.waitFor();
      assert.equal(
        new URL(await frame.getAttribute('src')).searchParams.get('showmedia'),
        'false',
      );
    }
    record.fullNavigations = full;
    record.summaryNavigations = summary;
    await snapshot(p, 'reload', record);
  } finally {
    release.release();
  }
}
async function paginationChallenge(p, record, mode, context) {
  let external = 0;
  const requests = [];
  p.on('request', (r) => {
    if (new URL(r.url()).origin !== new URL(base).origin) external++;
  });
  await p.route('**/api/posts?*', async (r) => {
    const cursor = new URL(r.request().url()).searchParams.get('cursor');
    if (!cursor)
      return r.fulfill({
        json: { ok: true, data: { posts: [post(1)], next_cursor: 'page-1' } },
      });
    requests.push(r);
  });
  await p.route('https://embed.reddit.com/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<button>Fixture action</button>',
    }),
  );
  await p.goto(`${base}/privacy`);
  await p.evaluate(() =>
    sessionStorage.setItem('waagd.external-content', 'decline'),
  );
  await p.goto(base);
  await p.locator('.post').waitFor();
  await p.evaluate(() => {
    window.qaEvents = [];
    for (const type of [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'gotpointercapture',
      'lostpointercapture',
      'click',
    ])
      document.addEventListener(
        type,
        (e) =>
          window.qaEvents.push({
            type,
            target: e.target.tagName,
            trusted: e.isTrusted,
            pointerId: e.pointerId,
          }),
        true,
      );
  });
  record.movements = [];
  for (let iteration = 1; iteration <= 3; iteration++) {
    await settings(p).scrollIntoViewIfNeeded();
    await p.waitForFunction(
      () =>
        document.querySelector('#feed-sentinel').dataset.state === 'loading',
    );
    assert.ok(requests.length > 0);
    const scrollBefore = await p.evaluate(() => scrollY);
    const box = await settings(p).boundingBox(),
      x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await p.mouse.move(x, y);
    await p.mouse.down();
    assert.equal(
      await dialog(p).isVisible(),
      false,
      'Down alone must not open consent',
    );
    if (mode === 'drag') await p.mouse.move(1, 1);
    const route = requests.shift();
    await route.fulfill({
      json: {
        ok: true,
        data: {
          posts: [
            post(iteration * 3),
            post(iteration * 3 + 1),
            post(iteration * 3 + 2),
          ],
          next_cursor: iteration === 3 ? null : `page-${iteration + 1}`,
        },
      },
    });
    await p.waitForFunction(
      (n) => document.querySelectorAll('.post').length === n,
      1 + iteration * 3,
    );
    const after = await settings(p).boundingBox();
    const scrollAfter = await p.evaluate(() => scrollY);
    const viewportDelta = after.y - box.y;
    const documentDelta = viewportDelta + scrollAfter - scrollBefore;
    record.movements.push({
      viewportDelta,
      documentDelta,
      scrollBefore,
      scrollAfter,
    });
    assert.ok(
      Math.abs(documentDelta) > 100,
      'Pagination moves footer in document',
    );
    // Later updates can retain viewport position through native scroll anchoring.
    if (iteration === 1)
      assert.ok(
        Math.abs(viewportDelta) > 100,
        'First gesture crosses an actual viewport target move',
      );
    await p.mouse.up();
    await settle(p);
    if (mode === 'drag') {
      assert.equal(await dialog(p).isVisible(), false);
      await settings(p).focus();
      await p.keyboard.press(iteration % 2 ? 'Space' : 'Enter');
    }
    await dialog(p).waitFor({ state: 'visible' });
    assert.equal(await p.locator('dialog').count(), 1);
    assert.equal(await focused(choice(p, 'decline')), true);
    assert.equal(external, 0);
    await p
      .locator('.embed-hint a')
      .first()
      .evaluate((n) => n.focus());
    assert.equal(await focused(choice(p, 'decline')), true);
    if (iteration === 1)
      await p.screenshot({
        path: `${output}/${engine}-${mode}-dialog.png`,
        fullPage: true,
      });
    await choice(p, 'decline').click();
    assert.equal(await focused(settings(p)), true);
    await snapshot(p, `pagination-${iteration}`, record);
  }
  // Normal reopening, native keyboard recovery, Allow, Revoke and persistence.
  await settings(p).click();
  await choice(p, 'allow').click();
  await p.locator('.media.reddit').first().scrollIntoViewIfNeeded();
  await p.locator('iframe').first().waitFor();
  await settings(p).focus();
  await p.keyboard.press('Space');
  await choice(p, 'decline').click();
  const count = external;
  assert.equal(await p.locator('iframe').count(), 0);
  record.events = await p.evaluate(() => window.qaEvents ?? []);
  await p.reload();
  await p.locator('.post').first().waitFor();
  await settle(p);
  assert.equal(external, count);
  assert.equal(await dialog(p).isVisible(), false);
  if (mode === 'capture' && engine === 'chromium') {
    await settings(p).scrollIntoViewIfNeeded();
    await p.evaluate(() => {
      window.qaCancel = [];
      document.addEventListener(
        'pointercancel',
        (e) =>
          window.qaCancel.push({
            trusted: e.isTrusted,
            target: e.target.tagName,
          }),
        true,
      );
    });
    const box = await settings(p).boundingBox();
    const cdp = await context.newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: [],
    });
    await settle(p);
    record.nativePointerCancel = await p.evaluate(() => window.qaCancel);
    assert.equal(record.nativePointerCancel.length, 1);
    assert.equal(record.nativePointerCancel[0].trusted, true);
    assert.equal(await dialog(p).isVisible(), false);
    await settings(p).focus();
    await p.keyboard.press('Enter');
    await dialog(p).waitFor({ state: 'visible' });
    await choice(p, 'decline').click();
    await cdp.detach();
  }
  record.externalRequests = external;
}
let engine, results;
try {
  for (engine of (process.env.WAAGD_BROWSERS ?? 'chromium,webkit').split(',')) {
    results = [];
    const browser = await engines[engine].launch();
    try {
      for (const activation of ['Enter', 'Space', 'mouse'])
        for (const mode of [
          'immediate',
          'delayed',
          '403',
          'away',
          'settings',
          'revoke',
        ])
          await runCase(browser, `${activation}-${mode}`, (p, r) =>
            focusChallenge(p, r, activation, mode),
          );
      for (const mode of ['capture', 'drag'])
        await runCase(browser, `repeated-pagination-${mode}`, (p, r, c) =>
          paginationChallenge(p, r, mode, c),
        );
      assert.equal(results.length, 20);
    } finally {
      await browser.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
