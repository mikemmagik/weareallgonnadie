import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Real provider traffic only: no credentials, request interception or network changes.
export async function verifyLiveReddit(page, { base, posts }) {
  await page.unrouteAll({ behavior: 'wait' });
  const results = [];
  for (const post of posts) {
    const responses = [];
    const requests = [];
    const failures = [];
    const violations = [];
    const onResponse = (response) => {
      if (/reddit\.com|\/embed\/reddit/.test(response.url()))
        responses.push({ url: response.url(), status: response.status() });
    };
    const onFailure = (request) =>
      failures.push({ url: request.url(), error: request.failure() });
    const onRequest = (request) => {
      if (/reddit\.com|redd\.it/.test(request.url()))
        requests.push(request.url());
    };
    const onConsole = (message) => {
      if (
        /Content Security Policy|Permissions policy|sandbox/i.test(
          message.text(),
        )
      )
        violations.push(message.text());
    };
    page.on('response', onResponse);
    page.on('request', onRequest);
    page.on('requestfailed', onFailure);
    page.on('console', onConsole);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/privacy`);
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(`${base}/?post=${post.publicationId}`);
    const card = page.locator(`[data-post-id="${post.publicationId}"]`);
    await card.waitFor();
    await page.waitForTimeout(1000);
    const beforeClick = responses.slice();
    const requestsBeforeClick = requests.slice();
    if (requestsBeforeClick.length)
      throw new Error('Provider request before explicit click');
    if (await card.locator('iframe').count())
      throw new Error('Iframe before click');
    await page
      .getByRole('button', { name: 'ALLOW EXTERNAL CONTENT', exact: true })
      .click();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(12000);
    const provider = page
      .frames()
      .find((frame) => frame.url().startsWith('https://embed.reddit.com/'));
    const providerText = provider
      ? await provider
          .locator('body')
          .innerText()
          .catch(() => '')
      : '';
    const media = provider
      ? await provider
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
          .catch(() => [])
      : [];
    const images = provider
      ? await provider
          .locator('img')
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              src: node.src,
              complete: node.complete,
              naturalWidth: node.naturalWidth,
            })),
          )
          .catch(() => [])
      : [];
    const contentVisible =
      !!providerText.trim() &&
      !/blocked|unavailable|access denied|network security|too many requests/i.test(
        providerText,
      );
    const links = await card
      .locator('a[target="_blank"]')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          href: node.href,
          rel: node.rel,
          text: node.textContent,
        })),
      );
    await page.screenshot({
      path: `output/playwright/release-reddit-${post.id}.png`,
      fullPage: true,
    });
    // The trusted page's original link stays independently navigable, even if Reddit refuses it.
    const originalLink = card.locator('.embed-hint a');
    const popupPromise = page.waitForEvent('popup');
    await originalLink.click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded').catch(() => {});
    const originalResponse = responses
      .filter((response) => response.url === post.url)
      .at(-1);
    const originalText = await popup
      .locator('body')
      .innerText()
      .catch(() => '');
    const originalNavigation = {
      url: popup.url(),
      status: originalResponse?.status ?? null,
      text: originalText.slice(0, 1200),
    };
    // Popup response events belong to its own page; query navigation status separately if absent.
    if (originalNavigation.status === null) {
      const response = await popup.goto(post.url).catch(() => null);
      originalNavigation.status = response?.status() ?? null;
      await popup.waitForTimeout(1000);
      originalNavigation.url = popup.url();
      originalNavigation.text = await popup
        .locator('body')
        .innerText()
        .then((text) => text.slice(0, 1200))
        .catch(() => '');
    }
    await popup.close();
    results.push({
      post,
      beforeClick,
      requestsBeforeClick,
      requests,
      responses,
      failures,
      violations,
      frames: page.frames().map((frame) => frame.url()),
      providerText: providerText.slice(0, 2500),
      media,
      images,
      contentVisible,
      mediaPresent:
        media.length > 0 || images.some((image) => image.naturalWidth > 0),
      automaticPlaybackObserved: media.some(
        (node) => !node.paused || node.currentTime > 0,
      ),
      autoplayVerification:
        contentVisible && media.length
          ? 'observed for 12 seconds only'
          : 'NOT VERIFIED: no playable content',
      links,
      originalNavigation,
    });
    page.off('response', onResponse);
    page.off('request', onRequest);
    page.off('requestfailed', onFailure);
    page.off('console', onConsole);
  }
  return results;
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
      `-s=${process.env.WAAGD_BROWSER_SESSION ?? 'releaseqa'}`,
      'run-code',
      `async page => (${verifyLiveReddit.toString()})(page, ${JSON.stringify(scenario)})`,
    ],
    { encoding: 'utf8', maxBuffer: 4_000_000 },
  );
  writeFileSync('output/release-qa/reddit-live.txt', output);
  assert.doesNotMatch(output, /### Error/);
  console.log(output.slice(0, output.indexOf('### Ran Playwright code')));
}
