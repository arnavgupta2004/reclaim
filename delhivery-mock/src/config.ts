// Environment-variable configuration. Nothing here is ever echoed back in a response or log.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface Config {
  /** When set, B2C endpoints require `Authorization: Token <apiToken>` (and /validate accepts Bearer or Token). */
  apiToken: string | null;
  /** Also accept `Authorization: Bearer <token>` and `X-API-Key: <token>` on B2C endpoints (connector compatibility). */
  acceptAltAuth: boolean;
  /** Scenario used when a request does not select one. */
  defaultScenario: string;
  /** Delay used by the `timeout` scenario. */
  timeoutMs: number;
  /** Include the `_mock` metadata object in JSON bodies. */
  includeMeta: boolean;
  /** Require the documented `format=json&data=` wrapper on /api/cmu/create.json. */
  strictFormat: boolean;
  /** Registered warehouse names (`pickup_location`). null = accept any non-empty name. */
  warehouses: string[] | null;
  /** Registered client name. null = do not check the optional `client` field. */
  clientName: string | null;
  /** How 6-digit pincodes that are not in the mock dataset behave. */
  unknownPincodes: 'serviceable' | 'nsz';
  /** Fixed clock for deterministic runs (ISO-8601). null = real clock. */
  fixedNow: Date | null;
  /** Auto-advance tracking stages every N seconds after creation. 0 = off (stage stays at its default). */
  progressSeconds: number;
  logLevel: LogLevel;
}

export const MAX_TIMEOUT_MS = 55_000; // stays under the 60 s Vercel maxDuration in vercel.json

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const fixed = env.MOCK_FIXED_NOW ? new Date(env.MOCK_FIXED_NOW) : null;
  if (fixed && Number.isNaN(fixed.getTime())) throw new Error('MOCK_FIXED_NOW is not a valid ISO-8601 date');
  const warehouses = (env.MOCK_WAREHOUSE_NAMES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const level = (env.MOCK_LOG_LEVEL ?? 'info').toLowerCase();
  return {
    apiToken: env.MOCK_API_TOKEN?.trim() || null,
    acceptAltAuth: bool(env.MOCK_ACCEPT_ALT_AUTH, false),
    defaultScenario: env.MOCK_SCENARIO?.trim() || 'normal',
    timeoutMs: Math.min(int(env.MOCK_TIMEOUT_MS, 15_000), MAX_TIMEOUT_MS),
    includeMeta: bool(env.MOCK_INCLUDE_META, true),
    strictFormat: bool(env.MOCK_STRICT_FORMAT, false),
    warehouses: warehouses.length ? warehouses : null,
    clientName: env.MOCK_CLIENT_NAME?.trim() || null,
    unknownPincodes: env.MOCK_UNKNOWN_PINCODES === 'nsz' ? 'nsz' : 'serviceable',
    fixedNow: fixed,
    progressSeconds: int(env.MOCK_PROGRESS_SECONDS, 0),
    logLevel: (['debug', 'info', 'warn', 'error', 'silent'].includes(level) ? level : 'info') as LogLevel,
  };
}
