import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Only publication JSON is a fixture. Provider requests, responses and playback
// are real. Frame DOM inspection is confined to browser test tooling.
const base = process.env.WAAGD_FRONTEND_BASE ?? 'http://127.0.0.1:8787';
const evidence = 'output/playwright/media-fix-002';
mkdirSync(evidence, { recursive: true });
const modulePath =
  process.env.WAAGD_PLAYWRIGHT_MODULE ??
  readdirSync(join(homedir(), '.npm/_npx'))
    .map((entry) =>
      join(homedir(), '.npm/_npx', entry, 'node_modules/playwright/index.mjs'),
    )
    .find(existsSync);
assert.ok(modulePath, 'Install the documented browser tooling first');
const engines = await import(pathToFileURL(modulePath).href);
const examples = [
  ['normal-video', 'aww', 'j1bvtv'],
  ['animated', 'formula1', '7qn3db'],
  ['image', 'aww', 'crpjwk'],
  ['text', 'IAmA', 'z1c9z'],
];
async function samples(page) {
  const result = [];
  for (let index = 0; index < 4; index++) {
    result.push({
      at: new Date().toISOString(),
      frames: await Promise.all(
        page
          .frames()
          .slice(1)
          .map(async (frame) => ({
            url: frame.url(),
            text: await frame
              .locator('body')
              .innerText()
              .catch(() => ''),
            media: await frame
              .locator('video,audio')
              .evaluateAll((nodes) =>
                nodes.map((node) => ({
                  tag: node.tagName,
                  paused: node.paused,
                  currentTime: node.currentTime,
                  muted: node.muted,
                  duration: node.duration,
                  readyState: node.readyState,
                  autoplay: node.autoplay,
                  src: node.currentSrc,
                })),
              )
              .catch(() => []),
            images: await frame
              .locator('img')
              .evaluateAll((nodes) =>
                nodes.map((node) => ({
                  src: node.src,
                  width: node.naturalWidth,
                })),
              )
              .catch(() => []),
            parentAccessBlocked: await frame
              .evaluate(() => {
                try {
                  void parent.document.body;
                  return false;
                } catch {
                  return true;
                }
              })
              .catch(() => null),
          })),
      ),
    });
    if (index < 3) await page.waitForTimeout(1000);
  }
  return result;
}
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
  for (const [label, community, id] of examples) {
    const url = `https://www.reddit.com/r/${community}/comments/${id}/`;
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const responses = [],
      requests = [],
      errors = [],
      failures = [];
    const pending = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('response', (response) =>
      pending.push(
        (async () =>
          responses.push({
            url: response.url(),
            status: response.status(),
            headers: await response.allHeaders().catch(() => ({})),
          }))(),
      ),
    );
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type()))
        errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('requestfailed', (request) =>
      failures.push({ url: request.url(), error: request.failure() }),
    );
    const result = {
      name,
      version: browser.version(),
      label,
      url,
      responses,
      errors,
      failures,
      requests,
      playPressed: false,
    };
    await page.route('**/api/posts?*', (route) =>
      route.fulfill({
        json: {
          ok: true,
          data: {
            posts: [
              {
                id: '00000000-0000-4000-8000-000000000001',
                type: 'video',
                origin: 'telegram',
                url,
                canonical_url: null,
                source_item_id: null,
                title: `Live Reddit ${label}`,
                source: 'Reddit',
                preview: null,
                body: null,
                embed: { kind: 'provider', provider: 'reddit', url, id },
                references: [],
                published_at: '2026-10-12T00:00:00.000Z',
                deleted_at: null,
              },
            ],
            next_cursor: null,
          },
        },
      }),
    );
    try {
      await page.goto(base);
      assert.equal(
        requests.filter(
          (value) => new URL(value).origin !== new URL(base).origin,
        ).length,
        0,
        'No provider request before consent',
      );
      await page
        .getByRole('button', { name: 'ALLOW EXTERNAL CONTENT', exact: true })
        .click();
      await page.locator('.media').scrollIntoViewIfNeeded();
      await page.locator('.reddit-play').waitFor();
      await page.waitForTimeout(8000);
      result.beforePlay = await samples(page);
      assert.equal(
        result.beforePlay.flatMap((sample) =>
          sample.frames.flatMap((frame) => frame.media),
        ).length,
        0,
        'Supported content-free embed creates no media elements before Play',
      );
      result.summaryVisible = result.beforePlay.some((sample) =>
        sample.frames.some((frame) => frame.text.includes('Posted by')),
      );
      result.attribution = await page.locator('.post-source').innerText();
      result.original = await page
        .locator('.embed-hint a')
        .getAttribute('href');
      assert.equal(result.original, url);
      await page.screenshot({
        path: `${evidence}/${name}-${label}-before.png`,
        fullPage: true,
      });
      await page.locator('.reddit-play').click();
      result.playPressed = true;
      await page.waitForTimeout(8000);
      result.afterPlay = await samples(page);
      const media = result.afterPlay.flatMap((sample) =>
        sample.frames.flatMap((frame) => frame.media),
      );
      result.playbackVerified =
        ['normal-video', 'animated'].includes(label) &&
        media.some((node) => !node.paused && node.currentTime > 0) &&
        new Set(media.map((node) => node.currentTime)).size > 1;
      result.fullContentVisible = result.afterPlay.some((sample) =>
        sample.frames.some((frame) => frame.text.includes('Posted by')),
      );
      result.status = result.summaryVisible
        ? 'NO PRE-PLAY MEDIA VERIFIED'
        : 'PROVIDER CONTENT NOT VERIFIED';
      await page.screenshot({
        path: `${evidence}/${name}-${label}-after.png`,
        fullPage: true,
      });
      await page
        .getByRole('button', { name: 'External content settings' })
        .click();
      await page
        .getByRole('button', {
          name: 'CONTINUE WITHOUT EXTERNAL CONTENT',
          exact: true,
        })
        .click();
      assert.equal(
        await page.locator('.media iframe, .reddit-play').count(),
        0,
        'Revocation removes full provider frame and activation',
      );
    } catch (error) {
      result.status = 'FAIL';
      result.error = String(error);
      process.exitCode = 1;
    }
    await Promise.allSettled(pending);
    results.push(result);
    console.log(
      JSON.stringify({
        name,
        version: result.version,
        label,
        status: result.status,
        playPressed: result.playPressed,
        playbackVerified: result.playbackVerified,
        error: result.error,
      }),
    );
    writeFileSync(
      `${evidence}/live-results.json`,
      JSON.stringify(results, null, 2),
    );
    await context.close();
  }
  // The older Worker adapter is separately observed: it keeps its opaque sandbox
  // and uses the official widget's content-free setting without any activation.
  for (const [label, community, id] of examples.slice(0, 2)) {
    const page = await browser.newPage();
    const url = `${base}/embed/reddit?url=${encodeURIComponent(`https://www.reddit.com/r/${community}/comments/${id}/`)}`;
    const responses = [],
      errors = [];
    page.on('response', (response) =>
      responses.push({ url: response.url(), status: response.status() }),
    );
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type()))
        errors.push(message.text());
    });
    try {
      await page.goto(url);
      await page.waitForTimeout(8000);
      const observed = await samples(page);
      assert.equal(
        observed.flatMap((sample) =>
          sample.frames.flatMap((frame) => frame.media),
        ).length,
        0,
      );
      results.push({
        name,
        version: browser.version(),
        label: `legacy-${label}`,
        url,
        playPressed: false,
        responses,
        errors,
        samples: observed,
        status: observed.some((sample) =>
          sample.frames.some((frame) => frame.text.includes('Posted by')),
        )
          ? 'NO PRE-PLAY MEDIA VERIFIED'
          : 'PROVIDER CONTENT NOT VERIFIED',
      });
    } catch (error) {
      results.push({
        name,
        label: `legacy-${label}`,
        status: 'FAIL',
        error: String(error),
        responses,
        errors,
      });
      process.exitCode = 1;
    }
    await page.close();
  }
  await browser.close();
}
writeFileSync(
  `${evidence}/live-results.json`,
  JSON.stringify(results, null, 2),
);
