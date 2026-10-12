import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  unlink,
  rmdir,
} from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type {
  CreatePostInput,
  CreatePostResult,
} from '../../shared/contracts.ts';
import { validateCreatePostInput } from '../../shared/contracts.ts';
import { record } from './api.ts';
import type { Api } from './api.ts';
import { RequestFailure } from './http.ts';

export class State {
  dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }
  async read(name: string): Promise<unknown> {
    try {
      return JSON.parse(
        await readFile(join(this.dir, name), 'utf8'),
      ) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  async write(name: string, value: unknown): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const temporary = join(this.dir, `${name}.${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, join(this.dir, name));
  }
  async remove(name: string): Promise<void> {
    await unlink(join(this.dir, name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  async locked<T>(name: string, action: () => Promise<T>): Promise<T> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const lock = join(this.dir, `${name}.lock`);
    try {
      await mkdir(lock);
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
        else if (error instanceof RequestFailure && error.retryAt)
          await this.state.write(name, {
            payload,
            saved_at: new Date().toISOString(),
            attempts,
            next_attempt_at: error.retryAt,
          });
        throw error;
      }
    });
  }
  async processed(): Promise<CreatePostInput[]> {
    await mkdir(this.state.dir, { recursive: true, mode: 0o700 });
    const result: CreatePostInput[] = [];
    for (const name of await readdir(this.state.dir))
      if (/^processed-[a-f0-9]+\.json$/.test(name)) {
        const input = validateCreatePostInput(
          record(await this.state.read(name)).payload,
        );
        if (input.valid) result.push(input.value);
      }
    return result;
  }
  async replay(): Promise<{ sent: number; failed: number }> {
    await mkdir(this.state.dir, { recursive: true, mode: 0o700 });
    let sent = 0;
    let failed = 0;
    let attempted = 0;
    for (const name of (await readdir(this.state.dir)).filter((n) =>
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
