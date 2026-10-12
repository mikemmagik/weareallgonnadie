import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test(
  'Astro and Worker build together without Cloudflare credentials or deployment',
  { timeout: 120_000 },
  () => {
    rmSync(new URL('../dist/', import.meta.url), {
      recursive: true,
      force: true,
    });
    rmSync(new URL('../build/worker/', import.meta.url), {
      recursive: true,
      force: true,
    });
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      CI: 'true',
      ASTRO_TELEMETRY_DISABLED: '1',
      XDG_CONFIG_HOME: `${root}/.wrangler/config`,
      XDG_CACHE_HOME: `${root}/.wrangler/cache`,
      WRANGLER_SEND_METRICS: 'false',
      WRANGLER_LOG_PATH: `${root}/.wrangler/logs`,
    };
    // Prove dry-run does not need whatever credentials may exist in the parent shell.
    for (const key of Object.keys(env))
      if (/^(CLOUDFLARE_|CF_)/.test(key)) delete env[key];
    const npmCli = process.env.npm_execpath;
    assert.ok(npmCli, 'Run this test with npm run test:smoke');
    execFileSync(process.execPath, [npmCli, 'run', 'build'], {
      cwd: root,
      env,
      stdio: 'inherit',
    });
    const html = readFileSync(
      new URL('../dist/index.html', import.meta.url),
      'utf8',
    );
    assert.match(html, /We Are All Gonna Die/);
    assert.match(html, /Incoming transmissions/);
    assert.match(html, /id="feed"/);
    assert.match(html, /<script type="module"/);
    assert.doesNotMatch(html, /class="post /);
    const assets = new URL('../dist/_astro/', import.meta.url);
    const scripts = readdirSync(assets).filter((name) => name.endsWith('.js'));
    assert.equal(scripts.length, 1, 'One small native browser module');
    assert.ok(
      readdirSync(assets).every((name) => !name.endsWith('.svg')),
      'Development illustrations are absent from production',
    );
    const client = scripts
      .map((name) => readFileSync(new URL(name, assets), 'utf8'))
      .join('');
    assert.doesNotMatch(
      client,
      /futurefails|The Daily Signal|dev-page-two|__demo-art/,
    );
    assert.ok(client.length < 25000, 'Keep client JavaScript small');
    assert.ok(
      readdirSync(new URL('../build/worker/', import.meta.url)).some((name) =>
        name.endsWith('.js'),
      ),
    );
  },
);
