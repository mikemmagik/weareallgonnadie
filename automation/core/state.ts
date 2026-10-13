import {
  mkdir,
  open,
  lstat,
  realpath,
  rename,
  readdir,
  unlink,
  rmdir,
} from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, isAbsolute, parse, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type {
  CreatePostInput,
  CreatePostResult,
} from '../../shared/contracts.ts';
import { validateCreatePostInput } from '../../shared/contracts.ts';
import { record } from './api.ts';
import type { Api } from './api.ts';
import { RequestFailure } from './http.ts';

export class StateError extends Error {}
export class State {
  dir: string;
  constructor(dir: string) {
    if (!isAbsolute(dir))
      throw new StateError('State directory must be an absolute private path.');
    this.dir = dir;
  }
  /** Check every component before creating anything; never repair arbitrary folders. */
  async ensure(): Promise<void> {
    const absolute = resolve(this.dir);
    let current = parse(absolute).root;
    for (const part of absolute
      .slice(current.length)
      .split('/')
      .filter(Boolean)) {
      current = join(current, part);
      let info;
      try {
        info = await lstat(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await mkdir(current, { mode: 0o700 }).catch(
          (failure: NodeJS.ErrnoException) => {
            if (failure.code !== 'EEXIST') throw failure;
          },
        );
        info = await lstat(current);
      }
      // macOS provides these root aliases; user-created symlinks are never accepted.
      const systemAlias =
        process.platform === 'darwin' &&
        ['/var', '/tmp', '/etc'].includes(current) &&
        info.isSymbolicLink() &&
        (await realpath(current)) === `/private${current}`;
      if (
        (!info.isDirectory() && !systemAlias) ||
        (info.isSymbolicLink() && !systemAlias)
      )
        throw new StateError(
          `Unsafe state path: ${current}. Use a real private directory without symlinks.`,
        );
    }
    const info = await lstat(absolute);
    if (info.uid !== process.getuid?.() || (info.mode & 0o7777) !== 0o700)
      throw new StateError(
        `Unsafe state directory: ${absolute}. Require ownership by the current user and mode 0700; review this dedicated folder before correcting it.`,
      );
  }
  path(name: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name))
      throw new StateError('Invalid state filename.');
    return join(this.dir, name);
  }
  privateFile(info: {
    isFile(): boolean;
    uid: number;
    mode: number;
    nlink: number;
  }): void {
    if (
      !info.isFile() ||
      info.uid !== process.getuid?.() ||
      (info.mode & 0o7777) !== 0o600 ||
      info.nlink !== 1
    )
      throw new StateError(
        'Unsafe state file. Require a regular file owned by the current user with mode 0600 and no links.',
      );
  }
  async checkFile(name: string): Promise<void> {
    try {
      this.privateFile(await lstat(this.path(name)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  async names(): Promise<string[]> {
    await this.ensure();
    return readdir(this.dir);
  }
  async read(name: string): Promise<unknown> {
    await this.ensure();
    await this.checkFile(name);
    try {
      const file = await open(
        this.path(name),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        this.privateFile(await file.stat());
        return JSON.parse(await file.readFile('utf8')) as unknown;
      } finally {
        await file.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async write(name: string, value: unknown): Promise<void> {
    await this.ensure();
    await this.checkFile(name);
    const temporary = this.path(`${name}.${randomUUID()}.tmp`);
    const file = await open(
      temporary,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(JSON.stringify(value));
      await file.close();
      await this.ensure();
      await this.checkFile(name);
      await rename(temporary, this.path(name));
    } finally {
      await file.close();
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
  async remove(name: string): Promise<void> {
    await this.ensure();
    await this.checkFile(name);
    await unlink(this.path(name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  async locked<T>(name: string, action: () => Promise<T>): Promise<T> {
    await this.ensure();
    const lock = this.path(`${name}.lock`);
    try {
      await mkdir(lock, { mode: 0o700 });
    } catch {
      throw new Error(
        `Another ${name} run is active, or a stale lock needs review.`,
      );
    }
    try {
      return await action();
    } finally {
      await rmdir(lock);
    }
  }
}
export function payloadKey(payload: CreatePostInput): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
export class Publisher {
  api: Api;
  state: State;
  constructor(api: Api, state: State) {
    this.api = api;
    this.state = state;
  }
  async submit(payload: CreatePostInput): Promise<CreatePostResult> {
    return this.state.locked(`outgoing-${payloadKey(payload)}`, async () => {
      const name = `outgoing-${payloadKey(payload)}.json`;
      if (!validateCreatePostInput(payload).valid)
        throw new Error('Invalid payload.');
      const prior = await this.state.read(name);
      const saved = prior === null ? {} : record(prior);
      if (
        typeof saved.next_attempt_at === 'number' &&
        saved.next_attempt_at > Date.now()
      )
        throw new RequestFailure(429, true, saved.next_attempt_at);
      const attempts = Number(saved.attempts ?? 0) + 1;
      if (attempts > 10)
        throw new Error(
          'Outgoing retry limit reached; manual review required.',
        );
      await this.state.write(name, {
        payload,
        saved_at: new Date().toISOString(),
        attempts,
      });
      try {
        const result = await this.api.publish(payload);
        await this.state.write(`processed-${payloadKey(payload)}.json`, {
          id: result.post.id,
          payload,
        });
        await this.state.remove(name);
        return result;
      } catch (error) {
        if (error instanceof RequestFailure && !error.retryable)
          await this.state.remove(name);
        else if (error instanceof RequestFailure)
          await this.state.write(name, {
            payload,
            saved_at: new Date().toISOString(),
            attempts,
            last_status: error.status,
            next_attempt_at: error.retryAt ?? Date.now(),
          });
        throw error;
      }
    });
  }
  async processed(): Promise<CreatePostInput[]> {
    const result: CreatePostInput[] = [];
    for (const name of await this.state.names())
      if (/^processed-[a-f0-9]+\.json$/.test(name)) {
        const input = validateCreatePostInput(
          record(await this.state.read(name)).payload,
        );
        if (input.valid) result.push(input.value);
      }
    return result;
  }
  async replay(): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    let attempted = 0;
    for (const name of (await this.state.names()).filter((n) =>
      /^outgoing-[a-f0-9]+\.json$/.test(n),
    )) {
      if (attempted >= 50) break;
      try {
        const saved = record(await this.state.read(name));
        if (
          Number(saved.attempts ?? 0) >= 10 ||
          (typeof saved.next_attempt_at === 'number' &&
            saved.next_attempt_at > Date.now())
        )
          continue;
        const payload = validateCreatePostInput(saved.payload);
        if (!payload.valid) throw new Error('Invalid saved payload.');
        // Monthly retries recheck current visible references through runChangelog.
        if (payload.value.type === 'changelog') continue;
        attempted++;
        await this.submit(payload.value);
        sent++;
      } catch {
        failed++;
      }
    }
    return { sent, failed };
  }
}
