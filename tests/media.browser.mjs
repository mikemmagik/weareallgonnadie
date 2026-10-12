import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export async function verifyReddit(page, { base, ids, live }) {
  await page.unrouteAll({ behavior: 'wait' });
  const checks = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const events = [];
  const responses = [];
  page.on('response', (response) => {
    if (response.url().includes('reddit.com'))
      responses.push({ url: response.url(), status: response.status() });
  });
  page.on('request', (request) => {
    if (request.url().includes('reddit.com')) events.push(request.url());
  });
  if (!live) {
    await page.route('https://embed.reddit.com/widgets.js', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `
      const block = document.querySelector('.reddit-embed-bq');
      try { parent.document.body.dataset.providerEscaped = 'yes'; } catch { document.body.dataset.parentBlocked = 'yes'; }
      const frame = document.createElement('iframe');
      frame.src = 'https://embed.reddit.com/r/test/comments/abc123/';
      frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups');
      frame.style.width = '100%'; frame.style.height = '450px';
      block.replaceWith(frame);
    `,
      }),
    );
    await page.route(
      'https://embed.reddit.com/r/test/comments/abc123/',
      (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<p>Public Reddit fixture · u/test · r/test</p><video controls></video>',
        }),
    );
  }
  const cardId = live ? ids.liveReddit : ids.reddit;
  await page.goto(`${base}/?post=${cardId}`);
  const card = page.locator(`[data-post-id="${cardId}"]`);
  await card.waitFor();
  check(
    (await page.locator('iframe').count()) === 0,
    'No Reddit frame before click',
  );
  check(events.length === 0, 'No Reddit widget requests before click');
  check(
    await card
      .locator('.post-source')
      .innerText()
      .then((t) => t.includes('Reddit')),
    'Source attribution visible',
  );
  await card.getByRole('button', { name: /Load Reddit embed/ }).click();
  const outer = card.locator('iframe.player-frame');
  await outer.waitFor();
  check(
    (await outer.getAttribute('sandbox')) === 'allow-scripts allow-popups',
    'Opaque sandbox never grants same-origin or navigation',
  );
  check(
    (await outer.getAttribute('allow')).includes("autoplay 'none'"),
    'Autoplay explicitly denied',
  );
  check(
    await card.locator('.post-source a').isVisible(),
    'Source link survives loading',
  );
  check(
    await card.locator('.embed-hint a').isVisible(),
    'Visible unavailable-content fallback link',
  );
  const adapter =
    page.frames().find((f) => f.url().includes('/embed/reddit?')) ??
    (await new Promise((resolve) => {
      const listener = (frame) => {
        if (frame.url().includes('/embed/reddit?')) {
          page.off('framenavigated', listener);
          resolve(frame);
        }
      };
      page.on('framenavigated', listener);
    }));
  if (live) {
    // Record a real provider outcome; a blocked or empty frame never counts as success.
    await page.waitForTimeout(12000);
    const provider = page
      .frames()
      .find((f) => f.url().startsWith('https://embed.reddit.com/'));
    const text = provider
      ? await provider
          .locator('body')
          .innerText()
          .catch(() => '')
      : '';
    const media = provider
      ? await provider
          .locator('video,audio')
          .evaluateAll((nodes) =>
            nodes.map((n) => ({
              tag: n.tagName,
              paused: n.paused,
              currentTime: n.currentTime,
              readyState: n.readyState,
            })),
          )
          .catch(() => [])
      : [];
    const result = {
      mode: 'live official widget',
      checks,
      requests: events,
      responses,
      frames: page.frames().map((f) => f.url()),
      providerText: text.slice(0, 5000),
      media,
      contentRendered:
        !!text.trim() &&
        !/blocked|unavailable|access denied|network security|too many requests/i.test(
          text,
        ),
      playbackVerified: false,
    };
    await page.screenshot({
      path: 'output/playwright/reddit-live.png',
      fullPage: true,
    });
    return result;
  }
  await adapter.locator('iframe').waitFor();
  check(
    (await adapter.locator('body').getAttribute('data-parent-blocked')) ===
      'yes',
    'Provider script cannot access parent DOM',
  );
  check(
    (await page.locator('body').getAttribute('data-provider-escaped')) === null,
    'Trusted DOM is unchanged',
  );
  check(
    (await page.locator('script[src*="reddit"]').count()) === 0,
    'Widget script absent from trusted document',
  );
  const policy = await adapter.evaluate(() => {
    try {
      return (
        document.permissionsPolicy?.allowsFeature('autoplay') ??
        document.featurePolicy?.allowsFeature('autoplay')
      );
    } catch {
      return null;
    }
  });
  check(policy === false, 'Adapter effective autoplay permission denied');
  await adapter.evaluate(() => {
    window.mediaViolations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.mediaViolations.push(e.effectiveDirective),
    );
    const inline = document.createElement('script');
    inline.textContent = 'window.badInline=true';
    document.body.append(inline);
    const other = document.createElement('script');
    other.src = 'https://evil.example/script.js';
    document.body.append(other);
    const frame = document.createElement('iframe');
    frame.src = 'https://evil.example/frame';
    document.body.append(frame);
  });
  await adapter.waitForFunction(() => window.mediaViolations.length >= 3);
  check(
    await adapter.evaluate(() => window.badInline === undefined),
    'Untrusted inline markup cannot execute in adapter',
  );
  check(
    await adapter.evaluate(() => window.mediaViolations.includes('frame-src')),
    'Adapter blocks arbitrary iframe origins',
  );
  check(
    await adapter.evaluate(() =>
      window.mediaViolations.includes('script-src-elem'),
    ),
    'Adapter blocks arbitrary scripts',
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Reddit news fits ${width}px`,
    );
  }
  await page.screenshot({
    path: 'output/playwright/reddit-desktop.png',
    fullPage: true,
  });
  await adapter
    .locator('iframe[src^="https://evil.example"]')
    .evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
  await page.setViewportSize({ width: 390, height: 844 });
  await card.screenshot({ path: 'output/playwright/reddit-mobile.png' });
  for (const [status, label] of [
    [404, 'Deleted post'],
    [403, 'Private post'],
    [451, 'Restricted post'],
  ]) {
    await page.unroute('https://embed.reddit.com/r/test/comments/abc123/');
    await page.route(
      'https://embed.reddit.com/r/test/comments/abc123/',
      (route) =>
        route.fulfill({
          status,
          contentType: 'text/html',
          body: `<p>${label} unavailable</p>`,
        }),
    );
    await page.goto(`${base}/?post=${cardId}`);
    await card.waitFor();
    const failure = page.waitForResponse((response) =>
      response
        .url()
        .startsWith('https://embed.reddit.com/r/test/comments/abc123/'),
    );
    await card.getByRole('button', { name: /Load Reddit embed/ }).click();
    check(
      (await failure).status() === status,
      `${label}: deterministic provider failure exercised`,
    );
    check(
      (await card.locator('.embed-hint a').isVisible()) &&
        (await card.locator('.post-source a').isVisible()),
      `${label}: fallback and attribution remain visible`,
    );
  }
  for (const key of ['redditMeme', 'redditNoMetadata']) {
    await page.goto(`${base}/?post=${ids[key]}`);
    const variant = page.locator(`[data-post-id="${ids[key]}"]`);
    await variant.waitFor();
    check(
      (await variant
        .getByRole('button', { name: /Load Reddit embed/ })
        .count()) === 1,
      `${key} remains eligible regardless of stored card type or missing metadata`,
    );
  }
  await page.goto(`${base}/?post=${ids.redditInvalid}`);
  const invalid = page.locator(`[data-post-id="${ids.redditInvalid}"]`);
  await invalid.waitFor();
  check(
    (await invalid
      .getByRole('button', { name: /Load Reddit embed/ })
      .count()) === 0,
    'Invalid provider identifier retains fallback',
  );
  check(
    await invalid.locator('.post-source a').isVisible(),
    'Invalid metadata preserves original source link',
  );
  return { mode: 'mocked widget', passed: checks.length, checks };
}

if (import.meta.main) {
  const scenario = JSON.parse(process.argv[2]);
  const output = execFileSync(
    'npx',
    [
      '--yes',
      '--package',
      '@playwright/cli',
      'playwright-cli',
      `-s=${process.env.WAAGD_BROWSER_SESSION ?? 'fix002'}`,
      'run-code',
      `async page => (${verifyReddit.toString()})(page, ${JSON.stringify(scenario)})`,
    ],
    { encoding: 'utf8', maxBuffer: 2_000_000 },
  );
  assert.doesNotMatch(output, /### Error/);
  const result = output.slice(0, output.indexOf('### Ran Playwright code'));
  writeFileSync(
    `output/playwright/reddit-${scenario.live ? 'live' : 'fixture'}-result.txt`,
    result,
  );
  console.log(result);
}
