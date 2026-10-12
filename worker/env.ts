import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  // Structural subset of the Static Assets Fetcher used by the Worker.
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  // Write authentication fails closed if this binding is missing.
  API_WRITE_TOKEN?: string;
}
