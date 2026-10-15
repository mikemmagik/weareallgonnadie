import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = process.env.WAAGD_FRONTEND_BASE ?? 'http://127.0.0.1:8787';
const evidence = 'output/playwright/media-polish-001';
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
const results = [];
for (const name of (
  process.env.WAAGD_BROWSERS ?? 'chromium,firefox,webkit'
).split(',')) {
  let browser;
  try {
    browser = await engines[name].launch();
  } catch (error) {
    results.push({ name, status: 'NOT VERIFIED', error: String(error) });
    continue;
  }
  try {
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      for (const kind of ['text', 'image', 'video', 'gif', 'long', '403']) {
        const context = await browser.newContext({
          viewport: { width, height: 1000 },
        });
        try {
          const page = await context.newPage();
          page.setDefaultTimeout(10000);
          const requests = [];
          const url = 'https://www.reddit.com/r/test/comments/abc123/';
          await page.route('**/api/posts?*', (route) =>
            route.fulfill({
              json: {
                ok: true,
                data: {
                  posts: [
                    {
                      id: '00000000-0000-4000-8000-000000000001',
                      type: kind === 'text' ? 'news' : 'video',
                      origin: 'telegram',
                      url,
                      canonical_url: null,
                      source_item_id: null,
                      title: `Reddit ${kind} geometry`,
                      source: 'Reddit',
                      preview: null,
                      embed: {
                        kind: 'provider',
                        provider: 'reddit',
                        url,
                        id: 'abc123',
                      },
                      body: null,
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
          // Deterministic provider documents test host geometry/scroll access.
          // Real Reddit content and playback are separately observed by the live suite.
          await page.route('https://embed.reddit.com/**', (route) => {
            requests.push(route.request().url());
            const summary =
              new URL(route.request().url()).searchParams.get('showmedia') ===
              'false';
            return route.fulfill({
              status: kind === '403' ? 403 : 200,
              contentType: 'text/html',
              body: `<html><body style="margin:0;background:#171c1c;color:white;font:16px sans-serif;overflow-wrap:anywhere"><main style="min-height:240px;padding:12px;box-sizing:border-box"><a href="${url}">Reddit · r/test · u/test</a><p>${kind === '403' ? 'Provider unavailable' : kind === 'long' ? 'Long provider summary. '.repeat(90) : 'Official-summary-shaped fixture'}</p>${summary ? '' : `<div style="height:950px">${['video', 'gif'].includes(kind) ? '<video controls></video>' : kind === 'image' ? 'Full image fixture' : 'Full text fixture'}</div>`}<button>Provider controls</button><a href="${url}">Comments</a></main></body></html>`,
            });
          });
          await page.goto(base);
          const media = page.locator('.media.reddit');
          const frame = media.locator('iframe');
          const play = media.locator('.reddit-play');
          await media.waitFor();
          assert.equal(
            requests.length,
            0,
            'No provider request before consent',
          );
          await page
            .getByRole('button', {
              name: 'ALLOW EXTERNAL CONTENT',
              exact: true,
            })
            .click();
          await frame.waitFor();
          await media.scrollIntoViewIfNeeded();
          const collapsed = await media.boundingBox();
          const summaryFrame = await frame.boundingBox();
          assert.equal(
            collapsed.height,
            300,
            'Compact container includes activation',
          );
          assert.ok(summaryFrame.height >= 250 && summaryFrame.height <= 254);
          assert.ok(
            requests.every(
              (value) =>
                new URL(value).searchParams.get('showmedia') === 'false',
            ),
          );
          const provider = await (await frame.elementHandle()).contentFrame();
          await provider
            .getByRole('button', { name: 'Provider controls' })
            .waitFor();
          assert.equal(
            await provider.locator('video,audio').count(),
            0,
            'Summary contains no playable media',
          );
          // Browser tooling alone checks that keyboard navigation can reach the
          // document footer inside the frame; application code never reads it.
          await provider
            .getByRole('button', { name: 'Provider controls' })
            .focus();
          await page.keyboard.press('Space');
          const footer = provider.getByRole('button', {
            name: 'Provider controls',
          });
          assert.equal(
            await footer.evaluate((node) => document.activeElement === node),
            true,
          );
          const footerBox = await footer.boundingBox();
          const frameBox = await frame.boundingBox();
          assert.ok(
            footerBox.y >= frameBox.y &&
              footerBox.y + footerBox.height <=
                frameBox.y + frameBox.height + 1,
            'Summary controls scroll into the frame viewport',
          );
          if (kind === 'long')
            await page.screenshot({
              path: `${evidence}/${name}-${width}-long-controls.png`,
              fullPage: true,
            });
          await play.focus();
          if (kind === 'text')
            await page.screenshot({
              path: `${evidence}/${name}-${width}-collapsed.png`,
              fullPage: true,
            });
          // Scripted clicks must not activate a provider that could autoplay.
          await play.evaluate((node) => node.click());
          assert.equal(
            await frame
              .getAttribute('src')
              .then((value) => new URL(value).searchParams.get('showmedia')),
            'false',
          );
          const before = await page.evaluate(() => scrollY);
          const top = (await media.boundingBox()).y;
          await page.keyboard.press(width % 2 ? 'Space' : 'Enter');
          await page.waitForFunction(() =>
            document.querySelector('.reddit-expanded'),
          );
          const expanded = await media.boundingBox();
          assert.equal(
            expanded.height,
            620,
            'Activation restores the existing full-content container',
          );
          assert.equal(await play.count(), 0);
          assert.equal(
            new URL(await frame.getAttribute('src')).searchParams.has(
              'showmedia',
            ),
            false,
          );
          assert.equal(
            await frame.evaluate((node) => document.activeElement === node),
            true,
            'Focus transfers to the provider frame',
          );
          assert.ok(
            Math.abs((await page.evaluate(() => scrollY)) - before) <= 1,
            'Activation preserves page scroll',
          );
          assert.ok(
            Math.abs(expanded.y - top) <= 1,
            'Expansion keeps the card top anchored',
          );
          const fullProvider = await (
            await frame.elementHandle()
          ).contentFrame();
          await fullProvider.waitForURL(
            (url) => !url.searchParams.has('showmedia'),
          );
          await fullProvider.locator('main > div').waitFor();
          await fullProvider
            .getByRole('button', { name: 'Provider controls' })
            .focus();
          await page.keyboard.press('Space');
          const fullFooter = await fullProvider
            .getByRole('button', { name: 'Provider controls' })
            .boundingBox();
          const fullFrame = await frame.boundingBox();
          assert.ok(
            fullFooter.y >= fullFrame.y &&
              fullFooter.y + fullFooter.height <=
                fullFrame.y + fullFrame.height + 1,
            'Full provider controls remain scrollable',
          );
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
            'No horizontal page overflow',
          );
          assert.ok(fullFrame.width <= width);
          assert.equal(
            await page.locator('.embed-hint a').getAttribute('href'),
            url,
          );
          assert.equal(
            await page.locator('.post-source a').getAttribute('href'),
            url,
          );
          if (kind === 'text')
            await page.screenshot({
              path: `${evidence}/${name}-${width}-expanded.png`,
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
          assert.equal(await frame.count(), 0);
          assert.equal(
            (await media.boundingBox()).height,
            300,
            'Revocation restores compact geometry',
          );
          await page
            .getByRole('button', { name: 'External content settings' })
            .click();
          await page
            .getByRole('button', {
              name: 'ALLOW EXTERNAL CONTENT',
              exact: true,
            })
            .click();
          await media.scrollIntoViewIfNeeded();
          await frame.waitFor();
          assert.equal((await media.boundingBox()).height, 300);
          assert.equal(
            new URL(await frame.getAttribute('src')).searchParams.get(
              'showmedia',
            ),
            'false',
            'Reallow cannot restore full content',
          );
          results.push({
            name,
            version: browser.version(),
            width,
            kind,
            status: 'PASS',
            collapsed,
            summaryFrame,
            expanded,
            fullFrame,
          });
        } finally {
          await context.close();
        }
      }
    }
  } catch (error) {
    results.push({
      name,
      status: 'FAIL',
      error: String(error),
      stack: error.stack,
    });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}
writeFileSync(
  `${evidence}/compact-results.json`,
  JSON.stringify(results, null, 2),
);
console.log(
  JSON.stringify(
    results.map(({ name, width, kind, status, error }) => ({
      name,
      width,
      kind,
      status,
      error,
    })),
    null,
    2,
  ),
);
