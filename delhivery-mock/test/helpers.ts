import { createApp, type App } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';

/** 2026-10-04 12:00 IST */
export const FIXED_NOW = '2026-10-04T06:30:00.000Z';
export const TOKEN = 'test-token-123';

export function makeApp(env: Record<string, string> = {}): App {
  const cfg = loadConfig({ MOCK_FIXED_NOW: FIXED_NOW, MOCK_TIMEOUT_MS: '250', MOCK_API_TOKEN: TOKEN, ...env });
  return createApp({ cfg, logger: createLogger('silent') });
}

export interface CallResult {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: any;
}

export async function call(
  app: App,
  method: string,
  url: string,
  opts: { body?: string | object; headers?: Record<string, string>; auth?: string | null } = {},
): Promise<CallResult> {
  const headers: Record<string, string> = {};
  if (opts.auth !== null) headers.authorization = opts.auth ?? `Token ${TOKEN}`;
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers[k.toLowerCase()] = v;
  const rawBody = opts.body === undefined ? '' : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  const res = await app.handle({ method, url, headers, rawBody });
  let json: any;
  try {
    json = JSON.parse(res.body);
  } catch {
    json = undefined;
  }
  return { status: res.status, headers: res.headers, text: res.body, json };
}

export function rvpShipment(over: Record<string, unknown> = {}) {
  return {
    name: 'Asha Rao',
    add: 'H-36 Residency Greens, Sector 46, Gurugram',
    pin: '122003',
    city: 'Gurugram',
    state: 'Haryana',
    country: 'India',
    phone: '+91-9876543210',
    order: 'ORD-8500',
    payment_mode: 'Pickup',
    products_desc: 'Damaged blender',
    total_amount: '8500',
    return_name: 'Reclaim Returns',
    return_add: 'Reclaim Returns WH, Dharwad',
    return_pin: '580001',
    return_phone: '9999999999',
    waybill: '',
    ...over,
  };
}

/** Documented wrapper: format=json&data=<json> */
export function manifestBody(shipments: object[], warehouse = 'Reclaim Returns WH'): string {
  return 'format=json&data=' + JSON.stringify({ shipments, pickup_location: { name: warehouse } });
}

export function createRvp(app: App, over: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return call(app, 'POST', '/api/cmu/create.json', { body: manifestBody([rvpShipment(over)]), headers });
}
