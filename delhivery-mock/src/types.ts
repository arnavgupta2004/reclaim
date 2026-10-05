import type { Config } from './config.js';
import type { Logger } from './logger.js';
import type { ResolvedScenario, ScenarioDef } from './scenarios.js';
import type { Store } from './store.js';

export interface MockRequest {
  method: string;
  /** Path + query string as received, e.g. `/scenario/no_rider/api/cmu/create.json?x=1`. */
  url: string;
  /** Lower-cased header names. */
  headers: Record<string, string | undefined>;
  rawBody: string;
}

export interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface Ctx {
  method: string;
  /** Path after removing any `/scenario/<name>` prefix. */
  path: string;
  query: URLSearchParams;
  headers: Record<string, string | undefined>;
  rawBody: string;
  cfg: Config;
  store: Store;
  log: Logger;
  now(): Date;
  scenario: ResolvedScenario;
  /** The selected scenario if it applies to this endpoint, else null (normal behaviour). */
  active: ScenarioDef | null;
  /** Set by a handler when it actually produced the scenario's effect. */
  applied: boolean;
  warnings: string[];
}

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
  /** Whether the response envelope is documented by Delhivery or mock-defined. */
  envelope: 'documented' | 'mock-defined';
  headers?: Record<string, string>;
}
