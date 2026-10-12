import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export async function verifyMvp(page, scenario) {
  const { base, mode, ids } = scenario;
  const checks = [];
  const check = (condition, label) => {
    if (!condition) throw new Error(label);
    checks.push(label);
  };
  await page.unrouteAll({ behavior: 'wait' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.abort(),
  );
  await page.route('https://example.com/**', (route) => route.abort());
  const itemReads = [];
  page.on('request', (request) => {
    if (request.url().startsWith(`${base}/api/posts/`))
      itemReads.push(request.url());
  });
  const url = mode === 'empty' ? base : `${base}/?post=${ids.target}`;
  await page.goto(url);
  if (mode === 'empty') {
    await page.waitForFunction(
      () => document.querySelector('#feed-sentinel')?.dataset.state === 'empty',
    );
    check(
      (await page.locator('.post').count()) === 0,
      'Real empty D1 feed has no invented publications',
    );
    return { passed: checks.length, checks };
  }
  if (mode === 'deleted') {
    await page.waitForFunction(() =>
      document
        .querySelector('#permalink-message')
        ?.textContent?.includes('deleted'),
    );
    check(
      (await page.locator(`[data-post-id="${ids.target}"]`).count()) === 0,
      'Deleted publication disappears from frontend and permalink',
    );
    check(
      (await page.locator('.post').count()) > 0,
      'Other publications remain available after deletion',
    );
    return { passed: checks.length, checks };
  }
  const target = page.locator(`[data-post-id="${ids.target}"]`);
  await target.waitFor();
  await page.waitForFunction(
    (id) =>
      document
        .querySelector(`[data-post-id="${id}"]`)
        ?.classList.contains('permalink-target'),
    ids.target,
  );
  check(
    itemReads.includes(`${base}/api/posts/${ids.target}`),
    'Permalink resolves through the actual item API',
  );
  check(
    (await target.getAttribute('tabindex')) === '-1',
    'Permalink publication receives keyboard focus',
  );
  check(
    (await target.locator('.post-title').textContent()) === 'Local evidence 0',
    'Older permalink publication renders in the existing feed',
  );
  for (const type of ['news', 'video', 'meme', 'changelog'])
    check(
      (await page.locator(`.post-${type}`).count()) > 0,
      `Real API ${type} publication renders`,
    );
  check(
    (await page.locator('iframe').count()) === 0,
    'No external embed loads before a click',
  );
  const video = page.locator(`[data-post-id="${ids.video}"]`);
  await video.locator('button.load-player').click();
  const frame = video.locator('iframe');
  check(
    (await frame.getAttribute('src')).startsWith(
      'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=0',
    ),
    'Click loads only the allowlisted player',
  );
  check(
    (await frame.getAttribute('allow')).includes("autoplay 'none'"),
    'Player denies autoplay',
  );
  check(
    (await video.locator('a[href="https://youtu.be/abcdefghijk"]').count()) > 0,
    'Unavailable provider retains a working original link',
  );
  const fallback = page.locator(`[data-post-id="${ids.fallback}"]`);
  check(
    (await fallback.locator('.fallback-player').getAttribute('href')) ===
      'https://example.com/unavailable',
    'Unsupported embed renders an original link',
  );
  const log = page.locator(`[data-post-id="${ids.log}"]`);
  check(
    (await log.locator('.changelog-body').textContent()).includes(
      '<script>window.pwned=true</script>',
    ),
    'Changelog source HTML is inert text',
  );
  check(
    await page.evaluate(() => window.pwned === undefined),
    'Publication HTML never executes',
  );
  check(
    (await log.locator('.post-references a').getAttribute('href')) ===
      `${base}/?post=${ids.target}`,
    'Changelog source reference is a readable publication permalink',
  );
  await page.locator('#feed-sentinel').scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => document.querySelector('#feed-sentinel')?.dataset.state === 'end',
  );
  const renderedIds = await page
    .locator('.post')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.postId));
  check(
    renderedIds.length === 29 && new Set(renderedIds).size === 29,
    'Real cursor pagination renders every publication exactly once',
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Integrated feed fits ${width}px`,
    );
  }
  await page.screenshot({
    path: 'output/playwright/integrated-mvp.png',
    fullPage: true,
  });
  return { passed: checks.length, checks };
}

if (import.meta.main) {
  const scenario = JSON.parse(process.argv[2]);
  const code = `async page => (${verifyMvp.toString()})(page, ${JSON.stringify(scenario)})`;
  const output = execFileSync(
    'npx',
    [
      '--yes',
      '--package',
      '@playwright/cli',
      'playwright-cli',
      '-s=doom',
      'run-code',
      code,
    ],
    { encoding: 'utf8', maxBuffer: 2_000_000 },
  );
  assert.doesNotMatch(output, /### Error/);
  assert.match(output, /"passed":\d+/);
  console.log(output.slice(0, output.indexOf('### Ran Playwright code')));
}
