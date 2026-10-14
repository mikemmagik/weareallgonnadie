import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function verifyMediaUx(page, base) {
  const checks = [];
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  const post = (n, changes = {}) => ({
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    type: 'video',
    origin: 'telegram',
    url: `https://example.com/${n}`,
    canonical_url: null,
    source_item_id: null,
    title: `Media ${n}`,
    source: 'Fixture',
    preview: null,
    embed: null,
    body: 'Publication text',
    references: [],
    published_at: `2026-10-12T${String(23 - n).padStart(2, '0')}:00:00.000Z`,
    deleted_at: null,
    ...changes,
  });
  const embed = (n, provider, url, id) =>
    post(n, {
      source: provider,
      url,
      embed: { kind: 'provider', provider, url, id },
    });
  const posts = [
    post(1, {
      type: 'news',
      preview: {
        image_url: 'https://images.example/preview.svg',
        alt_text: 'External preview',
      },
    }),
    embed(
      2,
      'tiktok',
      'https://www.tiktok.com/@test/video/7420000000000000001',
      '7420000000000000001',
    ),
    // Official player supports image posts; identity remains the existing verified video URL contract.
    embed(
      3,
      'tiktok',
      'https://www.tiktok.com/@test/video/7420000000000000002',
      '7420000000000000002',
    ),
    embed(
      4,
      'instagram',
      'https://www.instagram.com/reel/Reel_12345/',
      'reel/Reel_12345',
    ),
    embed(
      5,
      'instagram',
      'https://www.instagram.com/p/Post_12345/',
      'p/Post_12345',
    ),
    embed(
      6,
      'instagram',
      'https://www.instagram.com/p/Carousel_123/',
      'p/Carousel_123',
    ),
    embed(
      7,
      'reddit',
      'https://www.reddit.com/r/test/comments/abc123/',
      'abc123',
    ),
    embed(8, 'youtube', 'https://youtu.be/abcdefghijk', 'abcdefghijk'),
    post(9, {
      url: 'https://reddit.com/r/private/',
      embed: {
        kind: 'link',
        url: 'https://reddit.com/r/private/',
        label: null,
      },
    }),
    post(10, {
      type: 'news',
      source: 'reddit',
      url: 'https://redd.it/abc124',
      embed: {
        kind: 'link',
        url: 'https://example.com/other-source',
        label: null,
      },
    }),
    post(11, {
      type: 'meme',
      preview: {
        image_url: 'https://images.example/broken.svg',
        alt_text: null,
      },
    }),
    post(12, {
      type: 'news',
      preview: { image_url: 'https://127.0.0.1/private.svg', alt_text: null },
    }),
  ];
  const card = (n) => page.locator(`[data-post-id="${post(n).id}"]`);
  const external = [];
  const listener = (request) => {
    if (new URL(request.url()).origin !== base) external.push(request.url());
  };
  page.on('request', listener);
  let pageRequests = 0;
  await page.route('**/api/posts?*', (route) => {
    pageRequests++;
    const later = new URL(route.request().url()).searchParams.has('cursor');
    return route.fulfill({
      json: {
        ok: true,
        data: {
          posts: later ? [posts[7], ...posts.slice(8)] : posts.slice(0, 8),
          next_cursor: later ? null : 'next',
        },
      },
    });
  });
  await page.route('https://images.example/**', (route) =>
    route.fulfill({
      status: route.request().url().endsWith('broken.svg') ? 404 : 200,
      contentType: 'image/svg+xml',
      body: route.request().url().endsWith('broken.svg')
        ? ''
        : '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#234"/></svg>',
    }),
  );
  let redditStatus = 200;
  for (const host of [
    'www.tiktok.com',
    'www.instagram.com',
    'www.youtube-nocookie.com',
    'embed.reddit.com',
  ]) {
    await page.route(`https://${host}/**`, (route) =>
      route.fulfill({
        status: host === 'embed.reddit.com' ? redditStatus : 200,
        contentType: 'text/html',
        body: `<!doctype html><style>html,body{margin:0;height:100%;box-sizing:border-box}body{display:flex;flex-direction:column}main{flex:1;min-height:0;background:#345}footer{flex-shrink:0;height:80px}</style><header>Provider attribution</header><main>Deterministic ${host} ${route.request().url().includes('0000000002') ? 'image carousel' : 'media'} fixture${host === 'embed.reddit.com' && new URL(route.request().url()).searchParams.get('showmedia') !== 'false' ? '<video controls muted></video>' : ''}</main><footer><button>Play</button><button>Next image</button><a href="https://${host}/">Original provider</a></footer><script>try{parent.document.body.dataset.escaped='yes'}catch{document.body.dataset.parentBlocked='yes'}</script>`,
      }),
    );
  }
  await page.route('**/embed/reddit?*resolve=1', (route) =>
    route.fulfill({
      json: { url: 'https://www.reddit.com/r/test/comments/abc124/' },
    }),
  );
  const dialog = page.getByRole('dialog', { name: 'EXTERNAL CONTENT' });
  const allow = () =>
    page
      .getByRole('button', { name: 'ALLOW EXTERNAL CONTENT', exact: true })
      .click();
  const decline = () =>
    page
      .getByRole('button', {
        name: 'CONTINUE WITHOUT EXTERNAL CONTENT',
        exact: true,
      })
      .click();
  const settings = () =>
    page.getByRole('button', { name: 'External content settings' }).click();
  const reset = async () => {
    await page.goto(base);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await card(8).waitFor();
    await dialog.waitFor();
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await reset();
  check(
    external.length === 0,
    'First visit makes no external media, image or script requests',
  );
  check(
    (await page.locator('#feed iframe, #feed img').count()) === 0,
    'No external DOM resources before consent',
  );
  check(
    (await dialog.getAttribute('aria-describedby')) ===
      'external-content-description',
    'Semantic labelled dialog',
  );
  check(
    await page
      .locator('[data-external-choice="decline"]')
      .evaluate((n) => document.activeElement === n),
    'Conservative action receives focus',
  );
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  check(
    await page
      .locator('[data-external-choice="allow"]')
      .evaluate((n) => document.activeElement === n),
    'Tab wraps within modal',
  );
  check(
    (await page
      .locator('.media-consent, .load-player:not(.fallback-player)')
      .count()) === 0,
    'No per-post consent controls',
  );
  await page.keyboard.press('Escape');
  check(!(await dialog.isVisible()), 'Escape dismisses without allowing');
  check(
    (await page.evaluate(() =>
      sessionStorage.getItem('waagd.external-content'),
    )) === 'decline',
    'Escape saves negative session preference',
  );
  await page.reload();
  await card(8).waitFor();
  check(
    !(await dialog.isVisible()) && external.length === 0,
    'Reload after decline remains unloaded without repeat dialog',
  );
  await settings();
  // Footer settings legitimately scrolls to card 8. Establish distance before
  // allowing, then observe real geometry rather than assuming a card index.
  await page.evaluate(() => scrollTo(0, 0));
  const geometry = () =>
    card(8)
      .locator('.media')
      .evaluate((node) => {
        const { top, bottom } = node.getBoundingClientRect();
        return { top, bottom, height: innerHeight };
      });
  const settleViewport = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  await settleViewport();
  let bounds = await geometry();
  check(
    bounds.top > bounds.height + 320,
    'Lazy-load target is beyond the actual 320px loading margin',
  );
  await allow();
  check(
    (await page.evaluate(() =>
      sessionStorage.getItem('waagd.external-content'),
    )) === 'allow',
    'Settings accept persists affirmative choice',
  );
  await settleViewport();
  bounds = await geometry();
  check(
    bounds.top > bounds.height + 320,
    'Allow/focus restoration preserves the measured distance',
  );
  check(
    (await card(8).locator('iframe').count()) === 0,
    'Distant cards stay unloaded after allowing',
  );
  // Earlier portrait players can change height as they load. Position against
  // current geometry until the target is visible, rather than a stale offset.
  await page.waitForFunction(() => {
    const node = document.querySelector(
      '[data-post-id="00000000-0000-4000-8000-000000000008"] .media',
    );
    const bounds = node.getBoundingClientRect();
    if (bounds.top >= 0 && bounds.bottom <= innerHeight) return true;
    node.scrollIntoView({ block: 'center', behavior: 'instant' });
    return false;
  });
  await settleViewport();
  bounds = await geometry();
  check(
    bounds.top <= bounds.height + 320 && bounds.bottom >= -320,
    'Lazy-load target enters the measured loading margin',
  );
  await card(8).locator('iframe').waitFor();
  check(
    (await card(8).locator('iframe').count()) === 1,
    'Entering loading margin creates the deferred player once',
  );
  await card(1).scrollIntoViewIfNeeded();
  await card(1).locator('img').waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector(
      '[data-post-id="00000000-0000-4000-8000-000000000001"] img',
    );
    return image?.complete && image.naturalWidth > 0;
  });
  check(
    external.some((url) => url.includes('/preview.svg')),
    'External preview loads near viewport after consent',
  );
  await page.reload();
  await card(8).waitFor();
  check(
    !(await dialog.isVisible()),
    'Reload after accept does not repeat consent',
  );
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    await card(n).scrollIntoViewIfNeeded();
    await card(n).locator('iframe').waitFor();
    const frame = card(n).locator('iframe');
    check(
      (await frame.getAttribute('allow')).includes("autoplay 'none'"),
      `Media ${n} denies autoplay`,
    );
    if (n !== 7)
      check(
        new URL(await frame.getAttribute('src')).searchParams.get(
          'autoplay',
        ) === '0',
        `Media ${n} has no-autoplay URL`,
      );
    const provider = await (await frame.elementHandle()).contentFrame();
    await provider.locator('footer').waitFor();
    check(
      (await provider.locator('body').getAttribute('data-parent-blocked')) ===
        'yes',
      `Media ${n} cannot access host DOM`,
    );
    check(
      await card(n).locator('.embed-hint a').isVisible(),
      `Media ${n} keeps recovery link`,
    );
    if (n === 7) {
      check(
        new URL(await frame.getAttribute('src')).searchParams.get(
          'showmedia',
        ) === 'false',
        'Reddit loads only its summary after session consent',
      );
      const play = card(n).getByRole('button', {
        name: /Play \/ view Reddit media/,
      });
      check(
        await play.isVisible(),
        'Reddit has an explicit playback/view action, not another consent prompt',
      );
      check(
        (await provider.locator('video,audio').count()) === 0,
        'Reddit summary contains no playable media before Play',
      );
      await play.evaluate((node) => node.click());
      check(
        new URL(await frame.getAttribute('src')).searchParams.get(
          'showmedia',
        ) === 'false',
        'Untrusted scripted click does not authorize Reddit playback',
      );
      await play.focus();
      await page.keyboard.press('Enter');
      await provider.waitForURL((url) => !url.searchParams.has('showmedia'), {
        waitUntil: 'load',
      });
      await frame.waitFor({ state: 'visible' });
      check(
        !new URL(await frame.getAttribute('src')).searchParams.has('showmedia'),
        'Keyboard Play activates Reddit full content',
      );
      check(
        await frame.evaluate((node) => document.activeElement === node),
        'Activation transfers focus to the official Reddit frame',
      );
      await provider.locator('footer').waitFor();
      await provider.locator('video').waitFor();
      check(
        (await play.count()) === 0,
        'Playback/view action is removed after intentional activation',
      );
      check(
        (await frame.getAttribute('sandbox')) ===
          'allow-scripts allow-same-origin allow-popups',
        'Reddit direct frame isolated at validated remote origin without navigation privileges',
      );
    }
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      check(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Media ${n} fits ${width}px page`,
      );
      check(
        await provider
          .locator('footer')
          .evaluate(
            (node) => node.getBoundingClientRect().bottom <= innerHeight + 1,
          ),
        `Media ${n} fixture controls fit ${width}px frame`,
      );
      if (n === 2 || n === 3)
        check(
          await frame.evaluate((n) => {
            const r = n.getBoundingClientRect();
            return Math.abs(r.width / r.height - 9 / 16) < 0.01;
          }),
          `TikTok ${n} vertical ratio at ${width}px`,
        );
      if ([2, 4, 5, 6].includes(n) && [320, 1440].includes(width))
        await card(n).screenshot({
          path: `output/playwright/media-ux-001/layout-${page.context().browser().browserType().name()}-${n}-${width}.png`,
        });
    }
  }
  check(
    (await page.locator('body').getAttribute('data-escaped')) === null,
    'Trusted document remains unchanged',
  );
  await page.locator('#feed-sentinel').scrollIntoViewIfNeeded();
  await page.locator('#feed-sentinel[data-state="end"]').waitFor();
  check(
    (await page.locator('.post').count()) === 12 && pageRequests >= 2,
    'Infinite pagination appends without duplicated cards',
  );
  await card(10).scrollIntoViewIfNeeded();
  await card(10).locator('iframe').waitFor();
  check(
    (await card(10).locator('iframe').getAttribute('src')).startsWith(
      'https://embed.reddit.com/r/test/comments/abc124/',
    ),
    'Short Reddit resolution creates only validated official frame',
  );
  await card(11).scrollIntoViewIfNeeded();
  await card(11).locator('.image-unavailable').waitFor();
  check(
    await card(11).locator('.image-fallback a').isVisible(),
    'Broken external image retains source fallback',
  );
  check(
    (await card(12).locator('img').count()) === 0,
    'Private preview remains suppressed',
  );
  check(
    await card(9).locator('.fallback-player').isVisible(),
    'Unsupported Reddit URL offers safe source navigation',
  );
  const frameCount = await page.locator('#feed iframe').count();
  for (let i = 0; i < 3; i++) {
    await card(7).scrollIntoViewIfNeeded();
    await card(11).scrollIntoViewIfNeeded();
  }
  check(
    (await page.locator('#feed iframe').count()) === frameCount,
    'Repeated scrolling never duplicates media',
  );
  await settings();
  await decline();
  check(
    (await page.locator('#feed iframe, #feed img').count()) === 0,
    'Declining in settings removes loaded external media',
  );
  const requestsAfterDecline = external.length;
  await card(2).scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  check(
    external.length === requestsAfterDecline,
    'Scrolling after revoke makes no new provider requests',
  );
  check(
    await page
      .getByRole('button', { name: 'External content settings' })
      .evaluate((n) => document.activeElement === n),
    'Settings returns keyboard focus',
  );
  for (const status of [403, 404, 451]) {
    redditStatus = status;
    await settings();
    await allow();
    await card(7).scrollIntoViewIfNeeded();
    await card(7).locator('iframe').waitFor();
    check(
      new URL(
        await card(7).locator('iframe').getAttribute('src'),
      ).searchParams.get('showmedia') === 'false',
      'Reallow never restores previous Reddit playback activation',
    );
    check(
      (await card(7).locator('.embed-hint a').isVisible()) &&
        (await card(7).locator('.post-source a').isVisible()),
      `Reddit ${status} retains fallback and attribution independently of iframe events`,
    );
    await settings();
    await decline();
  }
  // A revoked short-link fetch must never reinsert a frame when it finishes.
  await page.unroute('**/embed/reddit?*resolve=1');
  let releaseResolution;
  const resolution = new Promise((resolve) => {
    releaseResolution = resolve;
  });
  await page.route('**/embed/reddit?*resolve=1', async (route) => {
    await resolution;
    await route.fulfill({
      json: { url: 'https://www.reddit.com/r/test/comments/abc124/' },
    });
  });
  const shortRequest = page.waitForRequest((request) =>
    request.url().includes('resolve=1'),
  );
  await settings();
  await allow();
  await card(10).scrollIntoViewIfNeeded();
  await shortRequest;
  await settings();
  await decline();
  releaseResolution();
  await page.waitForTimeout(200);
  check(
    (await card(10).locator('iframe').count()) === 0,
    'Revoking while Reddit identity resolves cannot create a late frame',
  );
  await page.unroute('**/embed/reddit?*resolve=1');
  await page.route('**/embed/reddit?*resolve=1', (route) =>
    route.fulfill({
      json: { url: 'https://www.reddit.com/r/test/comments/other1/' },
    }),
  );
  await settings();
  await allow();
  await card(10).scrollIntoViewIfNeeded();
  await card(10).locator('.media-fallback').waitFor();
  check(
    (await card(10).locator('iframe').count()) === 0,
    'Mismatched Reddit resolver identity is rejected without provider request',
  );
  // Simulate a restored document after settings changed on another first-party page.
  await page.evaluate(() => {
    sessionStorage.setItem('waagd.external-content', 'decline');
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  check(
    (await page.locator('#feed iframe, #feed img').count()) === 0,
    'Restored page rechecks a changed session preference',
  );
  await reset();
  check(await dialog.isVisible(), 'Cleared/new session asks again');
  await decline();
  const fresh = await page.context().browser().newContext();
  const freshPage = await fresh.newPage();
  await freshPage.route('**/api/posts?*', (r) =>
    r.fulfill({
      json: { ok: true, data: { posts: [posts[0]], next_cursor: null } },
    }),
  );
  await freshPage.goto(base);
  await freshPage.getByRole('dialog', { name: 'EXTERNAL CONTENT' }).waitFor();
  check(
    (await freshPage.locator('#feed img').count()) === 0,
    'Independent tab session never inherits affirmative consent',
  );
  await fresh.close();
  await page.addInitScript(() =>
    Object.defineProperty(window, 'sessionStorage', {
      get() {
        throw new DOMException('disabled', 'SecurityError');
      },
    }),
  );
  await page.reload();
  await dialog.waitFor();
  check(
    await dialog.locator('[data-storage-notice]').isVisible(),
    'Unavailable storage is explained and does not assume consent',
  );
  await allow();
  await card(1).scrollIntoViewIfNeeded();
  await card(1).locator('img').waitFor();
  check(
    !(await dialog.isVisible()),
    'Explicit allow works for current page when storage is unavailable',
  );
  await page.reload();
  await dialog.waitFor();
  check(
    (await page.locator('#feed iframe, #feed img').count()) === 0,
    'Reload with unavailable storage asks again before loading',
  );
  await decline();
  await page.addInitScript(() => delete window.IntersectionObserver);
  await page.reload();
  await dialog.waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await allow();
  await card(1).scrollIntoViewIfNeeded();
  await card(1).locator('img').waitFor();
  check(
    (await card(8).locator('iframe').count()) === 0,
    'No-observer fallback still leaves distant media unloaded',
  );
  await card(8).scrollIntoViewIfNeeded();
  await card(8).locator('iframe').waitFor();
  check(
    (await card(8).locator('iframe').count()) === 1,
    'Scroll fallback loads only relevant media without IntersectionObserver',
  );
  await settings();
  await decline();
  // CSP attack probes remain independent from provider construction fixtures.
  await page.evaluate(() => {
    window.violations = [];
    window.blockedUrls = [];
    document.addEventListener(
      'securitypolicyviolation',
      (e) => (
        window.violations.push(e.effectiveDirective),
        window.blockedUrls.push(e.blockedURI)
      ),
    );
    const inline = document.createElement('script');
    inline.textContent = 'window.hostInjected=true';
    document.body.append(inline);
    const script = document.createElement('script');
    script.src = 'https://evil.example/script.js';
    document.body.append(script);
    const iframe = document.createElement('iframe');
    iframe.src = 'https://evil.example/frame';
    document.body.append(iframe);
  });
  await page.waitForFunction(
    () =>
      window.violations.includes('frame-src') &&
      window.violations.some((d) => d.startsWith('script-src')),
  );
  check(
    await page.evaluate(() => window.hostInjected === undefined),
    'Host CSP denies inline script execution',
  );
  check(
    await page.evaluate(
      () =>
        window.blockedUrls.some(
          (url) =>
            url.startsWith('https://evil.example') &&
            !url.endsWith('script.js'),
        ) && window.blockedUrls.includes('https://evil.example/script.js'),
    ),
    'Host CSP denies arbitrary scripts and frames',
  );
  page.off('request', listener);
  return { passed: checks.length, checks };
}

if (import.meta.main) {
  const cache = join(homedir(), '.npm/_npx');
  const modulePath =
    process.env.WAAGD_PLAYWRIGHT_MODULE ??
    readdirSync(cache)
      .map((entry) => join(cache, entry, 'node_modules/playwright/index.mjs'))
      .find(existsSync);
  assert.ok(
    modulePath,
    'Install Playwright browsers using the documented QA setup first',
  );
  const engines = await import(pathToFileURL(modulePath).href);
  const results = [];
  mkdirSync('output/playwright/media-ux-001', { recursive: true });
  for (const name of (
    process.env.WAAGD_BROWSERS ?? 'chromium,firefox,webkit'
  ).split(',')) {
    let browser;
    try {
      browser = await engines[name].launch();
    } catch (error) {
      results.push({
        name,
        status: 'NOT VERIFIED',
        launchError: String(error),
      });
      continue;
    }
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      console.log(`Checking ${name}`);
      const result = await verifyMediaUx(
        page,
        process.env.WAAGD_FRONTEND_BASE ?? 'http://127.0.0.1:8787',
      );
      results.push({
        name,
        version: browser.version(),
        status: 'PASS',
        ...result,
      });
    } catch (error) {
      results.push({
        name,
        version: browser.version(),
        status: 'FAIL',
        error: String(error),
      });
      process.exitCode = 1;
    } finally {
      await browser.close();
    }
  }
  writeFileSync(
    resolve('output/playwright/media-ux-001/browser-results.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(
    JSON.stringify(
      results.map(({ name, version, status, passed, error, launchError }) => ({
        name,
        version,
        status,
        passed,
        error,
        launchError,
      })),
      null,
      2,
    ),
  );
}
