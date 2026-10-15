// Reproducible local-only acceptance runner. Build dist first; install Playwright
// outside the project. No Worker, credentials, provider access or ignored helpers.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyMediaUx } from './media-ux-001.browser.mjs';
import { verifyLegal } from './legal.browser.mjs';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const browsers = (
  process.env.WAAGD_BROWSERS ?? 'chromium,firefox,webkit'
).split(',');
const output = resolve('output/playwright/media-fix-003');
await mkdir(output, { recursive: true });
const modulePath =
  process.env.WAAGD_PLAYWRIGHT_MODULE ??
  readdirSync(join(homedir(), '.npm/_npx'))
    .map((entry) =>
      join(homedir(), '.npm/_npx', entry, 'node_modules/playwright/index.mjs'),
    )
    .find(existsSync);
assert.ok(
  modulePath,
  'Set WAAGD_PLAYWRIGHT_MODULE to an external installation',
);
const engines = await import(pathToFileURL(modulePath).href);
assert.ok(existsSync('dist/index.html'), 'Run npm run build:frontend first');
const headers = Object.fromEntries(
  (await readFile('public/_headers', 'utf8'))
    .split('\n')
    .filter((line) => line.startsWith('  '))
    .map((line) => {
      const separator = line.indexOf(':');
      return [
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim(),
      ];
    }),
);
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, 'http://localhost').pathname,
    );
    const file = resolve(
      'dist',
      `.${pathname}${extname(pathname) ? '' : '/index.html'}`,
    );
    assert.ok(file.startsWith(`${resolve('dist')}/`));
    const body = await readFile(file);
    response.writeHead(200, {
      ...headers,
      'Content-Type':
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
        }[extname(file)] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const summary = [];
const run = async (file) => {
  const status = await new Promise((done) => {
    const child = spawn(process.execPath, [file], {
      stdio: 'inherit',
      env: {
        ...process.env,
        WAAGD_FRONTEND_BASE: base,
        WAAGD_PLAYWRIGHT_MODULE: modulePath,
      },
    });
    child.on('error', () => done(1));
    child.on('exit', done);
  });
  assert.equal(status, 0, `${file} must actually pass`);
};
try {
  await run('tests/media-fix-003.browser.mjs');
  await run('tests/media-polish-001.browser.mjs');
  const compact = JSON.parse(
    await readFile(
      'output/playwright/media-polish-001/compact-results.json',
      'utf8',
    ),
  );
  for (const name of browsers) {
    assert.ok(
      name !== 'firefox' || process.platform === 'linux',
      'Firefox acceptance requires Linux',
    );
    const cases = compact.filter((result) => result.name === name);
    assert.equal(cases.length, 36);
    assert.ok(cases.every((result) => result.status === 'PASS'));
    const browser = await engines[name].launch();
    try {
      const result = {
        name,
        version: browser.version(),
        platform: process.platform,
        status: 'RUNNING',
        media: [],
      };
      summary.push(result);
      for (let repeat = 1; repeat <= 5; repeat++) {
        const page = await browser.newPage();
        page.setDefaultTimeout(10000);
        try {
          const media = await verifyMediaUx(page, base);
          assert.equal(media.passed, 176);
          result.media.push({ repeat, ...media });
          console.log(`${name}: media run ${repeat}/5 PASS (${media.passed})`);
        } finally {
          await page.close();
        }
      }
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      try {
        result.legal = await verifyLegal(page, base);
        assert.equal(result.legal.passed, 69);
      } finally {
        await page.close();
      }
      result.status = 'PASS';
      result.compactCases = cases.length;
      console.log(
        `${name} ${browser.version()}: 5 x 176 media checks, 36 compact cases, 69 legal checks PASS`,
      );
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  summary.push({ status: 'FAIL', error: String(error), stack: error.stack });
  process.exitCode = 1;
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await writeFile(
    join(output, `qa-${browsers.join('-')}.json`),
    JSON.stringify(summary, null, 2),
  );
}
