import { execFileSync } from 'node:child_process';

export async function verifyMonitor(page) {
  const base = 'http://127.0.0.1:4321';
  const results = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    results.push(message);
  };
  const post = (index, changes = {}) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    published_at: `2026-10-12T${String(15 - index).padStart(2, '0')}:00:00.000Z`,
    deleted_at: null,
    type: 'news',
    origin: 'auto',
    url: 'https://example.com/original',
    canonical_url: null,
    source_item_id: null,
    title: `Transmission ${index}`,
    source: 'Test source',
    body: null,
    preview: null,
    embed: null,
    references: [],
    ...changes,
  });
  const fixtures = [
    post(1, {
      title: '<img src=x onerror=alert(1)>',
      body: '<script>window.pwned=true</script>',
      preview: { image_url: `${base}/src/dev/robot.svg`, alt_text: 'Robots' },
    }),
    post(2, {
      type: 'video',
      embed: {
        kind: 'provider',
        provider: 'youtube',
        id: 'abcdefghijk',
        url: 'https://youtu.be/abcdefghijk',
      },
    }),
    post(3, {
      type: 'meme',
      preview: {
        image_url: `${base}/src/dev/meme.svg`,
        alt_text: 'Meme without cropping',
      },
    }),
    post(4, {
      type: 'changelog',
      url: null,
      body: '[ADDED]\n- New risks\n[FIXED]\n<script>window.pwned=true</script>',
      references: [
        { url: 'https://example.com/reference', title: 'Reference' },
      ],
    }),
    post(5, { title: '', body: null }),
  ];
  let mode = 'feed';
  let laterAttempts = 0;
  const cursors = [];
  await page.route('**/api/posts?*', async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    cursors.push(cursor);
    if (mode === 'empty')
      return route.fulfill({
        json: { ok: true, data: { posts: [], next_cursor: null } },
      });
    if (mode === 'error')
      return route.fulfill({
        status: 503,
        contentType: 'text/html',
        body: '<h1>Offline</h1>',
      });
    if (mode === 'scaffold')
      return route.fulfill({
        status: 501,
        json: {
          ok: false,
          error: { code: 'NOT_IMPLEMENTED', message: 'pending' },
        },
      });
    if (cursor) {
      if (laterAttempts++ === 0)
        return route.fulfill({
          status: 503,
          json: {
            ok: false,
            error: { code: 'SERVICE_UNAVAILABLE', message: 'offline' },
          },
        });
      return route.fulfill({
        json: {
          ok: true,
          data: {
            posts: [
              fixtures[4],
              post(6, {
                type: 'video',
                embed: {
                  kind: 'link',
                  url: 'https://example.com/missing',
                  label: null,
                },
              }),
              post(7, {
                type: 'meme',
                preview: {
                  image_url: `${base}/broken-image.svg`,
                  alt_text: null,
                },
              }),
            ],
            next_cursor: null,
          },
        },
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    return route.fulfill({
      json: { ok: true, data: { posts: fixtures, next_cursor: 'opaque/+?' } },
    });
  });
  await page.route('**/broken-image.svg', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.abort(),
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(base);
  await page.locator('#feed-sentinel[data-state="loading"]').waitFor();
  check(
    (await page.locator('#feed').getAttribute('aria-busy')) === 'true',
    'Loading is exposed accessibly',
  );
  await page.locator('.post').nth(4).waitFor();
  check(
    (await page.locator('.post').count()) === 5,
    'Initial feed renders five publications',
  );
  for (const type of ['news', 'video', 'meme', 'changelog'])
    check(
      (await page.locator(`.post-${type}`).count()) > 0,
      `${type} presentation renders`,
    );
  check(
    (await page.locator('iframe').count()) === 0,
    'No third-party player loads before interaction',
  );
  check(
    (await page.locator('#feed script, #feed img[onerror]').count()) === 0,
    'External HTML remains inert text',
  );
  check(
    (await page.locator('.post-title').last().innerText()) ===
      'Untitled transmission',
    'Missing title receives readable fallback',
  );
  check(
    (await page.locator('.post.text-only').count()) === 1,
    'Missing news preview stays compact',
  );
  check(
    await page
      .locator('#feed a[target="_blank"]')
      .evaluateAll((links) =>
        links.every(
          (link) =>
            link.rel.includes('noopener') &&
            link.rel.includes('noreferrer') &&
            /^https?:/.test(link.href),
        ),
      ),
    'External links are safe',
  );
  check(
    (await page
      .locator('.meme-media img')
      .evaluate((image) => getComputedStyle(image).objectFit)) === 'contain',
    'Meme aspect ratio stays readable',
  );
  await page.getByRole('button', { name: /Load YouTube embed/ }).click();
  const frame = page.locator('iframe');
  await frame.waitFor();
  check(
    (await frame.getAttribute('src')).includes('autoplay=0'),
    'Player URL disables autoplay',
  );
  check(
    (await frame.getAttribute('allow')).includes("autoplay 'none'"),
    'Player permissions explicitly deny autoplay',
  );
  check(
    (await page.locator('.embed-hint a').count()) === 1,
    'Unavailable player retains original-source escape hatch',
  );
  await page.locator('#feed-sentinel').scrollIntoViewIfNeeded();
  await page.locator('#feed-sentinel[data-state="error"]').waitFor();
  check(
    (await page.locator('.post').count()) === 5,
    'Pagination failure preserves existing publications',
  );
  await page.getByRole('button', { name: /Retry connection/ }).click();
  await page.locator('#feed-sentinel[data-state="end"]').waitFor();
  check(
    (await page.locator('.post').count()) === 7,
    'Scroll pagination appends older posts without duplicates',
  );
  check(
    cursors.slice(-2).every((cursor) => cursor === 'opaque/+?'),
    'Retry preserves the opaque pagination cursor',
  );
  check(
    (await page.locator('.fallback-player').count()) === 1,
    'Unavailable embed has clickable fallback',
  );
  await page.locator('.image-unavailable').waitFor();
  check(
    await page.locator('.image-unavailable .image-fallback').isVisible(),
    'Broken image retains readable original link',
  );
  check(
    (await page.locator('#load-more').isVisible()) === false,
    'End of feed stops loading controls',
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `No horizontal overflow at ${width}px`,
    );
    const heading = await page.locator('.feed-heading').boundingBox();
    check(heading.y < 550, `Header stays compact at ${width}px`);
  }
  mode = 'empty';
  await page.goto(base);
  await page.locator('#feed-sentinel[data-state="empty"]').waitFor();
  check(
    (await page.locator('.post').count()) === 0,
    'Empty API feed renders no fake posts',
  );
  mode = 'error';
  await page.reload();
  await page.locator('#feed-sentinel[data-state="error"]').waitFor();
  check(
    await page.getByRole('button', { name: /Retry connection/ }).isVisible(),
    'Non-JSON API error offers retry',
  );
  mode = 'scaffold';
  await page.reload();
  await page.locator('#feed-sentinel[data-state="error"]').waitFor();
  check(
    (await page.locator('#feed-message').innerText()).includes(
      'transmission is not',
    ),
    '501 backend scaffold has honest status',
  );
  await page.unroute('**/api/posts?*');
  await page.goto(`${base}/?demo=1`);
  await page.locator('.post').nth(5).waitFor();
  await page.locator('#feed-sentinel').scrollIntoViewIfNeeded();
  await page.locator('#feed-sentinel[data-state="end"]').waitFor();
  check(
    (await page.locator('.post').count()) === 9,
    'Typed development feed paginates to completion',
  );
  await page
    .locator('astro-dev-toolbar')
    .evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'output/playwright/desktop.png' });
  await page.screenshot({
    path: 'output/playwright/desktop-full.png',
    fullPage: true,
  });
  const logWidth = await page
    .locator('.post-changelog .post-content')
    .evaluate((el) => el.getBoundingClientRect().width);
  check(logWidth > 1100, 'Changelog occupies the full desktop feed width');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/mobile.png' });
  await page.screenshot({
    path: 'output/playwright/mobile-full.png',
    fullPage: true,
  });
  return { passed: results.length, checks: results };
}

if (import.meta.main) {
  execFileSync(
    'npx',
    [
      '--yes',
      '--package',
      '@playwright/cli',
      'playwright-cli',
      '-s=doom',
      'run-code',
      verifyMonitor.toString(),
    ],
    { stdio: 'inherit' },
  );
}
