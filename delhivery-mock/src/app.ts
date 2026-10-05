// Framework-free core: MockRequest -> MockResponse. Used by the Vercel function and the local server.

import { randomUUID, timingSafeEqual } from 'node:crypto';
import { loadConfig, type Config } from './config.js';
import { DOC_ERRORS, MOCK_TEXT } from './contract.js';
import { edit } from './handlers/edit.js';
import { manifest } from './handlers/manifest.js';
import { pickupRequest } from './handlers/pickup.js';
import { pincode } from './handlers/pincode.js';
import { tracking } from './handlers/tracking.js';
import { validate } from './handlers/validate.js';
import { createLogger, type Logger } from './logger.js';
import { buildOpenApi } from './openapi.js';
import { SCENARIOS, UnknownScenarioError, appliesTo, resolveScenario, type EndpointId } from './scenarios.js';
import { Store } from './store.js';
import type { Ctx, HandlerResult, MockRequest, MockResponse } from './types.js';
import { sleep } from './util.js';

export const VERSION = '1.0.0';

interface Route {
  method: 'GET' | 'POST';
  /** Documented path without trailing slash; matched with or without one. */
  path: string;
  endpoint: EndpointId;
  auth: 'token' | 'token_or_bearer';
  handler: (ctx: Ctx) => HandlerResult | Promise<HandlerResult>;
}

export const ROUTES: Route[] = [
  { method: 'GET', path: '/c/api/pin-codes/json', endpoint: 'pincode', auth: 'token', handler: pincode },
  { method: 'POST', path: '/api/cmu/create.json', endpoint: 'manifest', auth: 'token', handler: manifest },
  { method: 'POST', path: '/fm/request/new', endpoint: 'pickup_request', auth: 'token', handler: pickupRequest },
  { method: 'GET', path: '/api/v1/packages/json', endpoint: 'tracking', auth: 'token', handler: tracking },
  { method: 'POST', path: '/api/p/edit', endpoint: 'edit', auth: 'token', handler: edit },
  { method: 'POST', path: '/validate', endpoint: 'validate', auth: 'token_or_bearer', handler: validate },
];

const DOCUMENTED_PATHS: Record<EndpointId, string> = {
  pincode: '/c/api/pin-codes/json/',
  manifest: '/api/cmu/create.json',
  pickup_request: '/fm/request/new/',
  tracking: '/api/v1/packages/json/',
  edit: '/api/p/edit',
  validate: '/validate',
};

export interface AppOptions {
  cfg?: Config;
  store?: Store;
  logger?: Logger;
  now?: () => Date;
}

export interface App {
  cfg: Config;
  store: Store;
  handle(req: MockRequest): Promise<MockResponse>;
}

function stripSlash(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Recursively removes key fields and stringifies booleans — for the `malformed_fields` scenario. */
const DEGRADE_KEYS = new Set([
  'waybill', 'status', 'Status', 'StatusType', 'AWB', 'pickup', 'pre_paid', 'remarks',
  'pickup_id', 'quality', 'reason', 'delivery_codes', '_mock',
]);
function degrade(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(degrade);
  if (typeof v === 'boolean') return String(v);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k]) => !DEGRADE_KEYS.has(k))
        .map(([k, val]) => [k, degrade(val)]),
    );
  }
  return v;
}

export function createApp(opts: AppOptions = {}): App {
  const cfg = opts.cfg ?? loadConfig();
  const store = opts.store ?? new Store();
  const log = opts.logger ?? createLogger(cfg.logLevel);
  const now = opts.now ?? (() => (cfg.fixedNow ? new Date(cfg.fixedNow) : new Date()));

  function meta(ctx: Ctx, envelope: HandlerResult['envelope']) {
    const def = ctx.scenario.def;
    const behavior = !ctx.applied
      ? 'normal'
      : def.kind === 'documented'
        ? 'documented_delhivery_error'
        : def.kind === 'synthetic'
          ? 'synthetic_competition_failure'
          : 'documented_tracking_status';
    return {
      scenario: def.name,
      scenario_source: ctx.scenario.source,
      scenario_applied: ctx.applied,
      behavior,
      ...(ctx.applied && def.kind === 'synthetic'
        ? { note: 'Competition-only synthetic failure. This is NOT a documented Delhivery API behaviour.' }
        : {}),
      ...(ctx.applied && def.source ? { source: def.source } : {}),
      envelope:
        envelope === 'documented'
          ? 'documented by Delhivery'
          : 'mock-defined (Delhivery has not published this response envelope)',
      ...(ctx.warnings.length ? { warnings: ctx.warnings } : {}),
      contract: 'docs/delhivery-api-contract.md',
    };
  }

  function json(status: number, body: unknown, headers: Record<string, string> = {}): MockResponse {
    return {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
      body: JSON.stringify(body),
    };
  }

  function serviceInfo() {
    return {
      service: 'reclaim-delhivery-mock',
      version: VERSION,
      description:
        'Mock of Delhivery B2C APIs (+ Delhivery Maps address validation) for the Reclaim agent. Not affiliated with Delhivery.',
      endpoints: ROUTES.map((r) => ({ method: r.method, path: DOCUMENTED_PATHS[r.endpoint], endpoint: r.endpoint })),
      scenario_selection: [
        'Header  X-Mock-Scenario: <name>',
        'Path    /scenario/<name>/<documented path>  (e.g. base URL https://<host>/scenario/no_rider)',
        'Env     MOCK_SCENARIO=<name>  (server default)',
      ],
      scenarios: SCENARIOS.map((s) => ({ name: s.name, kind: s.kind, applies_to: s.appliesTo, description: s.description })),
      default_scenario: cfg.defaultScenario,
      auth_enforced: cfg.apiToken !== null,
      openapi: '/openapi.json',
      contract: 'docs/delhivery-api-contract.md',
    };
  }

  async function handle(req: MockRequest): Promise<MockResponse> {
    const started = Date.now();
    const requestId = randomUUID();
    const url = new URL(req.url || '/', 'http://mock.local');
    const base = { 'x-request-id': requestId };
    const finish = (res: MockResponse, fields: Record<string, unknown>) => {
      log.info('request', {
        request_id: requestId,
        method: req.method,
        path: url.pathname,
        status: res.status,
        duration_ms: Date.now() - started,
        ...fields,
      });
      return res;
    };

    let scenario;
    try {
      scenario = resolveScenario(url.pathname, req.headers['x-mock-scenario'], cfg.defaultScenario);
    } catch (e) {
      if (!(e instanceof UnknownScenarioError)) throw e;
      return finish(
        json(400, { error: `MOCK: unknown scenario "${e.scenario}"`, valid_scenarios: SCENARIOS.map((s) => s.name) }, base),
        { scenario: e.scenario, outcome: 'unknown_scenario' },
      );
    }
    const path = stripSlash(scenario.path);
    const scen = { 'x-mock-scenario': scenario.def.name, ...base };

    if (path === '/health' && req.method === 'GET') {
      return finish(json(200, { status: 'ok', service: 'reclaim-delhivery-mock', version: VERSION, time: new Date().toISOString() }, scen), {});
    }
    if (path === '/' && req.method === 'GET') return finish(json(200, serviceInfo(), scen), {});
    if (path === '/openapi.json' && req.method === 'GET') {
      const proto = (req.headers['x-forwarded-proto'] ?? 'http').split(',')[0]!.trim();
      const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:3000';
      const prefix = scenario.source === 'path' ? `/scenario/${scenario.def.name}` : '';
      return finish(json(200, buildOpenApi(`${proto}://${host}${prefix}`), scen), {});
    }

    const candidates = ROUTES.filter((r) => r.path === path);
    if (!candidates.length) {
      return finish(json(404, { error: 'MOCK: route not found', path: url.pathname }, scen), { outcome: 'not_found' });
    }
    const route = candidates.find((r) => r.method === req.method);
    if (!route) {
      return finish(json(405, { error: `MOCK: method ${req.method} not allowed` }, { ...scen, allow: candidates.map((r) => r.method).join(', ') }), {
        outcome: 'method_not_allowed',
      });
    }

    if (cfg.apiToken) {
      // Documented B2C scheme: `Authorization: Token <token>`. Maps (/validate) documents Bearer.
      // MOCK_ACCEPT_ALT_AUTH=true additionally accepts Bearer / X-API-Key everywhere (connector compatibility).
      const apiKey = (req.headers['x-api-key'] ?? '').trim();
      const auth = (req.headers.authorization ?? '').trim() || (cfg.acceptAltAuth && apiKey ? `Token ${apiKey}` : '');
      const m = /^(Token|Bearer)\s+(.+)$/i.exec(auth);
      const schemeOk = m && (m[1]!.toLowerCase() === 'token' || route.auth === 'token_or_bearer' || cfg.acceptAltAuth);
      if (!auth) {
        return finish(json(401, { error: DOC_ERRORS.authMissing }, scen), { endpoint: route.endpoint, outcome: 'auth_missing' });
      }
      if (!m || !schemeOk || !safeEqual(m[2]!.trim(), cfg.apiToken)) {
        return finish(json(401, { error: DOC_ERRORS.authWrongToken }, scen), { endpoint: route.endpoint, outcome: 'auth_invalid' });
      }
    }

    const def = scenario.def;
    const ctx: Ctx = {
      method: req.method,
      path,
      query: url.searchParams,
      headers: req.headers,
      rawBody: req.rawBody,
      cfg,
      store,
      log,
      now,
      scenario,
      active: def.name !== 'normal' && appliesTo(def, route.endpoint) ? def : null,
      applied: false,
      warnings: [],
    };

    const result = await route.handler(ctx);
    const logFields = { endpoint: route.endpoint, scenario: def.name, scenario_source: scenario.source };
    const headers = { ...scen, 'x-mock-scenario-applied': 'false', ...(result.headers ?? {}) };

    if (ctx.active?.name === 'timeout') {
      ctx.applied = true;
      log.warn('holding response (timeout scenario)', { request_id: requestId, delay_ms: cfg.timeoutMs });
      await sleep(cfg.timeoutMs);
      const body = { error: MOCK_TEXT.timeout, ...(cfg.includeMeta ? { _mock: meta(ctx, 'mock-defined') } : {}) };
      return finish(json(504, body, { ...headers, 'x-mock-scenario-applied': 'true' }), { ...logFields, applied: true });
    }
    if (ctx.active?.name === 'malformed') {
      ctx.applied = true;
      const text = JSON.stringify(result.body);
      const truncated = text.slice(0, Math.max(12, Math.floor(text.length * 0.6)));
      return finish(
        { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers, 'x-mock-scenario-applied': 'true' }, body: truncated },
        { ...logFields, applied: true },
      );
    }
    if (ctx.active?.name === 'malformed_fields') {
      ctx.applied = true;
      return finish(json(200, degrade(result.body), { ...headers, 'x-mock-scenario-applied': 'true' }), { ...logFields, applied: true });
    }

    const body = cfg.includeMeta ? { ...result.body, _mock: meta(ctx, result.envelope) } : result.body;
    return finish(json(result.status, body, { ...headers, 'x-mock-scenario-applied': String(ctx.applied) }), {
      ...logFields,
      applied: ctx.applied,
    });
  }

  return { cfg, store, handle };
}
