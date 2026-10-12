import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  // Structural subset of the Static Assets Fetcher used by this scaffold.
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  // Future write authentication must fail closed if this binding is missing.
  API_WRITE_TOKEN?: string;
}
