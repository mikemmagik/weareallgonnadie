import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export async function verifyReddit(page, { base, ids, live }) {
  await page.unrouteAll({ behavior: 'wait' });
  await page.goto(`${base}/privacy`);
  await page.evaluate(() => sessionStorage.clear());
  const checks = [];
  const check = (ok, label) => {
    if (!ok) throw new Error(label);
    checks.push(label);
  };
  const requests = [];
  const responses = [];
  const requestListener = (request) => {
    if (request.url().includes('reddit.com')) requests.push(request.url());
  };
  const responseListener = (response) => {
    if (response.url().includes('reddit.com'))
      responses.push({ url: response.url(), status: response.status() });
  };
  page.on('request', requestListener);
  page.on('response', responseListener);
  let providerStatus = 200;
  if (!live) {
    await page.route('https://embed.reddit.com/widgets.js', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `
      const block = document.querySelector('.reddit-embed-bq');
      try { parent.document.body.dataset.providerEscaped = 'yes'; } catch { document.body.dataset.parentBlocked = 'yes'; }
      const frame = document.createElement('iframe');
      frame.src = 'https://embed.reddit.com/r/test/comments/abc123/?showmedia=' + block.getAttribute('data-embed-showmedia');
      frame.style.width = '100%'; frame.style.height = '450px';
      block.replaceWith(frame);
    `,
      }),
    );
    await page.route('https://embed.reddit.com/r/test/comments/**', (route) =>
      route.fulfill({
        status: providerStatus,
        contentType: 'text/html',
        body: `<p>${providerStatus === 200 ? 'Public Reddit fixture · u/test · r/test' : 'Unavailable Reddit post'}</p>${new URL(route.request().url()).searchParams.get('showmedia') === 'false' ? '' : '<video controls></video>'}<script>try{parent.document.body.dataset.providerEscaped='yes'}catch{document.body.dataset.parentBlocked='yes'}</script>`,
      }),
    );
  }
  const cardId = live ? ids.liveReddit : ids.reddit;
  await page.goto(`${base}/?post=${cardId}`);
  const card = page.locator(`[data-post-id="${cardId}"]`);
  await card.waitFor();
  check(
    (await page.locator('iframe').count()) === 0,
    'No Reddit frame before session consent',
  );
  check(requests.length === 0, 'No Reddit requests before session consent');
  check(
    (await card.locator('.post-source').innerText()).includes('Reddit'),
    'Source attribution visible',
  );
  await page
    .getByRole('button', { name: 'ALLOW EXTERNAL CONTENT', exact: true })
    .click();
  await card.scrollIntoViewIfNeeded();
  const frame = card.locator('iframe');
  await frame.waitFor();
  check(
    (await frame.getAttribute('sandbox')) ===
      'allow-scripts allow-same-origin allow-popups',
    'Direct official Reddit origin remains sandboxed without host or top-navigation access',
  );
  check(
    (await frame.getAttribute('allow')).includes("autoplay 'none'"),
    'Autoplay explicitly denied',
  );
  check(
    (await card.locator('.post-source a').isVisible()) &&
      (await card.locator('.embed-hint a').isVisible()),
    'Attribution and independent recovery link survive loading',
  );
  if (live) {
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
    await page.screenshot({
      path: 'output/playwright/reddit-live.png',
      fullPage: true,
    });
    return {
      mode: 'live official iframe',
      checks,
      requests,
      responses,
      providerText: text.slice(0, 5000),
      contentRendered:
        !!text.trim() &&
        !/blocked|unavailable|access denied|network security/i.test(text),
      playbackVerified: false,
    };
  }
  const provider = await (await frame.elementHandle()).contentFrame();
  await provider.locator('p').waitFor();
  check(
    (await provider.locator('video').count()) === 0,
    'Direct summary has no playable media before Play',
  );
  check(
    (await provider.locator('body').getAttribute('data-parent-blocked')) ===
      'yes',
    'Direct provider cannot access parent DOM',
  );
  check(
    (await page.locator('body').getAttribute('data-provider-escaped')) === null,
    'Trusted DOM unchanged',
  );
  check(
    (await page.locator('script[src*="reddit"]').count()) === 0,
    'No Reddit script executes in trusted host',
  );
  // Retain the original adapter's independent security assertions, even though full URLs now use a direct frame.
  await page.evaluate((base) => {
    const frame = document.createElement('iframe');
    frame.id = 'adapter-security-probe';
    frame.setAttribute('sandbox', 'allow-scripts allow-popups');
    frame.allow = "autoplay 'none'";
    frame.src = `${base}/embed/reddit?url=${encodeURIComponent('https://www.reddit.com/r/test/comments/abc123/')}`;
    document.body.append(frame);
  }, base);
  const adapterHandle = await page
    .locator('#adapter-security-probe')
    .elementHandle();
  const adapter = await adapterHandle.contentFrame();
  await adapter.locator('iframe').waitFor();
  const child = await (
    await adapter.locator('iframe').elementHandle()
  ).contentFrame();
  await child.locator('p').waitFor();
  check(
    (await child.locator('video').count()) === 0,
    'Legacy opaque adapter preserves the content-free provider setting',
  );
  check(
    (await adapter.locator('body').getAttribute('data-parent-blocked')) ===
      'yes',
    'Legacy official widget cannot access parent DOM',
  );
  const policy = await adapter.evaluate(
    () =>
      document.permissionsPolicy?.allowsFeature('autoplay') ??
      document.featurePolicy?.allowsFeature('autoplay'),
  );
  check(policy === false, 'Adapter effective autoplay permission denied');
  await adapter.evaluate(() => {
    window.mediaViolations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.mediaViolations.push(e.effectiveDirective),
    );
    const inline = document.createElement('script');
    inline.textContent = 'window.badInline=true';
    document.body.append(inline);
    const script = document.createElement('script');
    script.src = 'https://evil.example/script.js';
    document.body.append(script);
    const frame = document.createElement('iframe');
    frame.src = 'https://evil.example/frame';
    document.body.append(frame);
  });
  await adapter.waitForFunction(() => window.mediaViolations.length >= 3);
  check(
    await adapter.evaluate(() => window.badInline === undefined),
    'Untrusted adapter inline scripts cannot execute',
  );
  check(
    await adapter.evaluate(() => window.mediaViolations.includes('frame-src')),
    'Adapter blocks arbitrary frame origins',
  );
  check(
    await adapter.evaluate(() =>
      window.mediaViolations.includes('script-src-elem'),
    ),
    'Adapter blocks arbitrary script origins',
  );
  await page
    .locator('#adapter-security-probe')
    .evaluate((node) => node.remove());
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Reddit fits ${width}px`,
    );
  }
  await card.screenshot({ path: 'output/playwright/reddit-desktop.png' });
  for (const status of [404, 403, 451]) {
    providerStatus = status;
    await page
      .getByRole('button', { name: 'External content settings' })
      .click();
    await page
      .getByRole('button', {
        name: 'CONTINUE WITHOUT EXTERNAL CONTENT',
        exact: true,
      })
      .click();
    const failure = page.waitForResponse((r) =>
      r.url().startsWith('https://embed.reddit.com/r/test/comments/abc123/'),
    );
    await page
      .getByRole('button', { name: 'External content settings' })
      .click();
    await page
      .getByRole('button', { name: 'ALLOW EXTERNAL CONTENT', exact: true })
      .click();
    await card.scrollIntoViewIfNeeded();
    check(
      (await failure).status() === status,
      `Reddit ${status} provider failure exercised`,
    );
    check(
      (await card.locator('.embed-hint a').isVisible()) &&
        (await card.locator('.post-source a').isVisible()),
      `Reddit ${status} fallback and attribution remain`,
    );
  }
  for (const key of ['redditMeme', 'redditNoMetadata']) {
    await page.goto(`${base}/?post=${ids[key]}`);
    const variant = page.locator(`[data-post-id="${ids[key]}"]`);
    await variant.waitFor();
    check(
      (await variant.locator('.media[data-provider="Reddit"]').count()) === 1,
      `${key} stays eligible across card type or missing metadata`,
    );
  }
  await page.goto(`${base}/?post=${ids.redditInvalid}`);
  const invalid = page.locator(`[data-post-id="${ids.redditInvalid}"]`);
  await invalid.waitFor();
  check(
    (await invalid.locator('.media[data-provider="Reddit"]').count()) === 0,
    'Invalid provider identity retains fallback',
  );
  check(
    await invalid.locator('.post-source a').isVisible(),
    'Invalid identity preserves original source link',
  );
  page.off('request', requestListener);
  page.off('response', responseListener);
  return {
    mode: 'deterministic official frame and legacy widget isolation',
    passed: checks.length,
    checks,
  };
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
