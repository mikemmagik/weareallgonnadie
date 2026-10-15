import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Only the local publication API is a fixture. All provider traffic is real and untouched.
const base = process.env.WAAGD_FRONTEND_BASE ?? 'http://127.0.0.1:8787';
const cache = join(homedir(), '.npm/_npx');
const modulePath =
  process.env.WAAGD_PLAYWRIGHT_MODULE ??
  readdirSync(cache)
    .map((entry) => join(cache, entry, 'node_modules/playwright/index.mjs'))
    .find(existsSync);
if (!modulePath)
  throw new Error('Install Playwright and its browser engines first');
const engines = await import(pathToFileURL(modulePath).href);
const examples = [
  [
    'reddit-image',
    'reddit',
    'https://www.reddit.com/r/aww/comments/crpjwk/',
    'crpjwk',
  ],
  [
    'reddit-text',
    'reddit',
    'https://www.reddit.com/r/IAmA/comments/z1c9z/',
    'z1c9z',
  ],
  ['reddit-short', 'reddit', 'https://redd.it/crpjwk', 'crpjwk'],
  [
    'tiktok-video',
    'tiktok',
    'https://www.tiktok.com/@scout2015/video/6718335390845095173',
    '6718335390845095173',
  ],
  [
    'instagram-historical-example',
    'instagram',
    'https://www.instagram.com/p/fA9uwTtkSN/',
    'p/fA9uwTtkSN',
  ],
];
const evidence = 'output/playwright/media-ux-001';
mkdirSync(evidence, { recursive: true });
const results = [];
for (const name of (
  process.env.WAAGD_BROWSERS ?? 'chromium,firefox,webkit'
).split(',')) {
  let browser;
  try {
    browser = await engines[name].launch();
  } catch (error) {
    results.push({ name, status: 'NOT VERIFIED', launchError: String(error) });
    continue;
  }
  for (const [label, provider, url, id] of examples) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const responses = [],
      failures = [],
      consoleErrors = [],
      requests = [];
    const pending = [];
    page.on('response', (response) =>
      pending.push(
        (async () => {
          responses.push({
            url: response.url(),
            status: response.status(),
            headers: await response.allHeaders().catch(() => ({})),
          });
        })(),
      ),
    );
    page.on('request', (request) => requests.push(request.url()));
    page.on('requestfailed', (request) =>
      failures.push({ url: request.url(), error: request.failure() }),
    );
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type()))
        consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));
    const post = {
      id: '00000000-0000-4000-8000-000000000001',
      type: 'video',
      origin: 'telegram',
      url,
      canonical_url: null,
      source_item_id: null,
      title: `Live provider check: ${label}`,
      source: provider,
      preview: null,
      body: null,
      embed: { kind: 'provider', provider, url, id },
      references: [],
      published_at: '2026-10-12T00:00:00.000Z',
      deleted_at: null,
    };
    // No request interception is installed on any provider origin.
    await page.route('**/api/posts?*', (route) =>
      route.fulfill({
        json: { ok: true, data: { posts: [post], next_cursor: null } },
      }),
    );
    try {
      await page.goto(base);
      await page.getByRole('dialog').waitFor();
      const beforeConsent = requests.filter(
        (value) => new URL(value).origin !== base,
      );
      if (beforeConsent.length)
        throw new Error('External request before consent');
      await page
        .getByRole('button', { name: 'ALLOW EXTERNAL CONTENT', exact: true })
        .click();
      await page.locator('.media').scrollIntoViewIfNeeded();
      await page.waitForTimeout(12000);
      const frames = [];
      for (const frame of page.frames().slice(1)) {
        frames.push({
          url: frame.url(),
          text: (
            await frame
              .locator('body')
              .innerText()
              .catch(() => '')
          ).slice(0, 5000),
          images: await frame
            .locator('img')
            .evaluateAll((nodes) =>
              nodes.map((node) => ({
                src: node.src,
                complete: node.complete,
                naturalWidth: node.naturalWidth,
              })),
            )
            .catch(() => []),
          media: await frame
            .locator('video,audio')
            .evaluateAll((nodes) =>
              nodes.map((node) => ({
                tag: node.tagName,
                paused: node.paused,
                currentTime: node.currentTime,
                readyState: node.readyState,
                autoplay: node.autoplay,
              })),
            )
            .catch(() => []),
          dimensions: await frame
            .evaluate(() => ({
              viewportWidth: innerWidth,
              viewportHeight: innerHeight,
              documentWidth: document.documentElement.scrollWidth,
              documentHeight: document.documentElement.scrollHeight,
            }))
            .catch(() => null),
          hostAccessBlocked: await frame
            .evaluate(() => {
              try {
                void parent.document.body;
                return false;
              } catch {
                return true;
              }
            })
            .catch(() => null),
        });
      }
      await page.screenshot({
        path: `${evidence}/live-${name}-${label}-390.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({
        path: `${evidence}/live-${name}-${label}-1440.png`,
        fullPage: true,
      });
      await Promise.allSettled(pending);
      results.push({
        name,
        version: browser.version(),
        label,
        url,
        beforeConsent,
        responses,
        failures,
        consoleErrors,
        frames,
        fallback: await page.locator('.embed-hint').innerText(),
        autoplayPlaybackVerified: false,
      });
      console.log(`${name} ${label}: observation recorded`);
    } catch (error) {
      results.push({
        name,
        version: browser.version(),
        label,
        error: String(error),
        responses,
        failures,
        consoleErrors,
      });
    } finally {
      await context.close();
    }
    writeFileSync(
      `${evidence}/live-results.json`,
      JSON.stringify(results, null, 2),
    );
  }
  await browser.close();
}
writeFileSync(
  `${evidence}/live-results.json`,
  JSON.stringify(results, null, 2),
);
