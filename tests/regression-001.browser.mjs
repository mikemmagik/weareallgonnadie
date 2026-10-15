import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export async function verifyIndependentPolicies(page, { base, ids }) {
  const checks = [];
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  await page.unrouteAll({ behavior: 'wait' });
  await page.goto(`${base}/privacy`);
  await page.evaluate(() => sessionStorage.clear());
  for (const host of [
    'www.youtube-nocookie.com',
    'www.tiktok.com',
    'www.instagram.com',
  ])
    await page.route(`https://${host}/**`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<p>Isolated provider fixture</p>',
      }),
    );
  await page.goto(base);
  await page.locator(`[data-post-id="${ids.instagram}"]`).waitFor();
  check(
    (await page.locator('iframe').count()) === 0,
    'All three providers wait for an explicit click',
  );
  await page
    .getByRole('button', { name: 'ALLOW EXTERNAL CONTENT', exact: true })
    .click();
  for (const provider of ['youtube', 'tiktok', 'instagram']) {
    const card = page.locator(`[data-post-id="${ids[provider]}"]`);
    await card.scrollIntoViewIfNeeded();
    await card.locator('iframe').waitFor();
    const frame = card.locator('iframe');
    const src = await frame.getAttribute('src');
    check(
      new URL(src).searchParams.get('autoplay') === '0',
      `${provider}: autoplay URL disabled`,
    );
    check(
      (await frame.getAttribute('allow')).includes("autoplay 'none'"),
      `${provider}: autoplay permission disabled`,
    );
    await page.waitForFunction(
      (src) =>
        [...document.querySelectorAll('iframe')].some(
          (frame) => frame.src === src,
        ),
      src,
    );
    const providerFrame =
      page.frames().find((f) => f.url() === src) ??
      (await new Promise((resolve) => {
        page.on('framenavigated', (frame) => {
          if (frame.url() === src) resolve(frame);
        });
      }));
    check(
      (await providerFrame.locator('p').textContent()) ===
        'Isolated provider fixture',
      `${provider}: fixture loads under production frame policy`,
    );
    check(
      (await card.locator('a[target="_blank"]').count()) > 0,
      `${provider}: original link survives loading`,
    );
  }
  const reddit = page.locator(`[data-post-id="${ids.reddit}"]`);
  check(
    (await reddit.locator('.media[data-provider="Reddit"]').count()) === 1,
    'D03 independently offers a session-controlled Reddit embed',
  );
  check(
    (await reddit.locator('.post-source').textContent()).includes('Reddit'),
    'Reddit source attribution remains',
  );
  const links = await reddit
    .locator('a')
    .evaluateAll((nodes) =>
      nodes.map((a) => ({ href: a.href, rel: a.rel, target: a.target })),
    );
  check(
    links.length >= 2 &&
      links.every(
        (a) =>
          a.href.includes('/comments/abc123/') &&
          a.rel.includes('noopener') &&
          a.target === '_blank',
      ),
    'Reddit attribution and original links have safe destinations',
  );
  await page.evaluate(() => {
    window.regressionViolations = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      window.regressionViolations.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
      }),
    );
    const frame = document.createElement('iframe');
    frame.src = 'https://untrusted.example/frame';
    document.body.append(frame);
    const script = document.createElement('script');
    script.textContent = 'window.regressionInlineExecuted = true';
    document.body.append(script);
    const external = document.createElement('script');
    external.src = 'https://untrusted.example/script.js';
    document.body.append(external);
  });
  await page.waitForFunction(() => window.regressionViolations.length >= 3);
  check(
    await page.evaluate(() => window.regressionInlineExecuted === undefined),
    'Inline scripts cannot execute',
  );
  check(
    await page.evaluate(() =>
      window.regressionViolations.some(
        (v) =>
          v.directive === 'frame-src' &&
          v.blocked === 'https://untrusted.example',
      ),
    ),
    'Unapproved iframe origin is blocked',
  );
  check(
    await page.evaluate(() =>
      window.regressionViolations.some(
        (v) =>
          v.directive === 'script-src-elem' &&
          v.blocked === 'https://untrusted.example/script.js',
      ),
    ),
    'Unapproved third-party script is blocked',
  );
  await page.screenshot({
    path: 'output/playwright/regression-policy.png',
    fullPage: true,
  });
  return { passed: checks.length, checks };
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
      `-s=${process.env.WAAGD_BROWSER_SESSION ?? 'regression001'}`,
      'run-code',
      `async page => (${verifyIndependentPolicies.toString()})(page, ${JSON.stringify(scenario)})`,
    ],
    { encoding: 'utf8', maxBuffer: 2_000_000 },
  );
  assert.doesNotMatch(output, /### Error/);
  assert.match(output, /"passed":\d+/);
  console.log(output.slice(0, output.indexOf('### Ran Playwright code')));
}
