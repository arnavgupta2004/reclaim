// Exercise every scenario against a running server (local or deployed).
//
//   BASE_URL=http://localhost:3000 MOCK_API_TOKEN=... npm run exercise
//   CLIENT_TIMEOUT_MS=5000   client-side timeout used for the timeout scenario (default 5000)

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const TOKEN = process.env.MOCK_API_TOKEN ?? '';
const CLIENT_TIMEOUT_MS = Number(process.env.CLIENT_TIMEOUT_MS ?? 5000);
const RUN = Date.now().toString(36); // unique order ids per run

const tomorrow = new Date(Date.now() + 5.5 * 3600_000 + 86_400_000).toISOString().slice(0, 10);

function rvp(order: string, over: Record<string, unknown> = {}) {
  const data = {
    shipments: [
      {
        name: 'Asha Rao', add: 'H-36 Residency Greens, Sector 46, Gurugram', pin: '122003', city: 'Gurugram',
        state: 'Haryana', country: 'India', phone: '+91-9876543210', order, payment_mode: 'Pickup',
        products_desc: 'Damaged blender', total_amount: '8500', return_add: 'Reclaim Returns WH, Dharwad',
        return_pin: '580001', return_phone: '9999999999', waybill: '', ...over,
      },
    ],
    pickup_location: { name: 'Reclaim Returns WH' },
  };
  return 'format=json&data=' + JSON.stringify(data);
}

interface Step {
  label: string;
  method: 'GET' | 'POST';
  path: string | (() => string);
  scenario?: string;
  body?: string | (() => string);
  expect: string;
  after?: (json: any) => void;
}

let createdWaybill = '';
const pickupBody = JSON.stringify({ pickup_time: '11:00:00', pickup_date: tomorrow, pickup_location: 'Reclaim Returns WH', expected_package_count: 1 });

const steps: Step[] = [
  { label: 'health', method: 'GET', path: '/health', expect: '200 ok' },
  { label: 'pincode serviceable', method: 'GET', path: '/c/api/pin-codes/json/?filter_codes=122003', expect: '200, remarks ""' },
  { label: 'pincode documented 400064 (pickup N)', method: 'GET', path: '/c/api/pin-codes/json/?filter_codes=400064', expect: '200, pickup "N"' },
  { label: 'pincode invalid', method: 'GET', path: '/c/api/pin-codes/json/?filter_codes=999999', expect: '200, delivery_codes []' },
  { label: 'pincode embargo', method: 'GET', path: '/c/api/pin-codes/json/?filter_codes=744101', expect: '200, remarks "Embargo"' },
  {
    label: 'RVP manifest success', method: 'POST', path: '/api/cmu/create.json', body: rvp(`ORD-${RUN}`),
    expect: '200 success true + waybill', after: (j) => (createdWaybill = j?.shipments?.[0]?.waybill ?? ''),
  },
  { label: 'track created waybill', method: 'GET', path: () => `/api/v1/packages/json/?waybill=${createdWaybill}`, expect: '200 PP Scheduled' },
  { label: 'track by order id', method: 'GET', path: `/api/v1/packages/json/?ref_ids=ORD-${RUN}`, expect: '200 (same instance) or not-found (cold instance)' },
  { label: 'track stage DTO', method: 'GET', path: () => `/api/v1/packages/json/?waybill=${createdWaybill}`, scenario: 'rvp_dto', expect: '200 DL DTO' },
  { label: 'track unknown waybill', method: 'GET', path: '/api/v1/packages/json/?waybill=1234567890123', expect: '200 error "Data does not exists..."' },
  { label: 'NO RIDER (synthetic) manifest', method: 'POST', path: '/api/cmu/create.json', scenario: 'no_rider', body: rvp(`NR-${RUN}`), expect: '200 success false, MOCK SYNTHETIC' },
  { label: 'NO RIDER (synthetic) pickup request', method: 'POST', path: '/fm/request/new/', scenario: 'no_rider', body: pickupBody, expect: '200 success false, MOCK SYNTHETIC' },
  { label: 'no rider after manifest (tracking)', method: 'GET', path: () => `/api/v1/packages/json/?waybill=${createdWaybill}`, scenario: 'no_rider_after_manifest', expect: '200 PP Scheduled + failed attempt' },
  { label: 'LOW BALANCE (documented)', method: 'POST', path: '/api/cmu/create.json', scenario: 'low_balance', body: rvp(`LB-${RUN}`), expect: '200 success false, insufficient balance' },
  { label: 'non-serviceable pin (documented)', method: 'POST', path: '/api/cmu/create.json', body: rvp(`NS-${RUN}`, { pin: '999999' }), expect: '200 success false, non serviceable pincode' },
  { label: 'MALFORMED body', method: 'POST', path: '/api/cmu/create.json', scenario: 'malformed', body: rvp(`MF-${RUN}`), expect: '200 + unparseable JSON' },
  { label: 'MALFORMED fields', method: 'POST', path: '/api/cmu/create.json', scenario: 'malformed_fields', body: rvp(`MX-${RUN}`), expect: '200 + JSON missing waybill/status' },
  { label: 'address validation ok', method: 'POST', path: '/validate', body: JSON.stringify({ address: 'H-36 1st floor residency greens sector 46 gurgaon 122003', req_id: RUN }), expect: '200 quality ok' },
  { label: 'address validation junk', method: 'POST', path: '/validate', body: JSON.stringify({ address: 'asdf 1' }), expect: '200 quality not_ok' },
  { label: 'pickup request success', method: 'POST', path: '/fm/request/new/', body: pickupBody, expect: '200 status Scheduled' },
  { label: 'cancel created RVP', method: 'POST', path: '/api/p/edit', body: () => JSON.stringify({ waybill: createdWaybill, cancellation: 'true' }), expect: '200 success true, Canceled' },
  { label: 'TIMEOUT', method: 'POST', path: '/api/cmu/create.json', scenario: 'timeout', body: rvp(`TO-${RUN}`), expect: `client gives up after ${CLIENT_TIMEOUT_MS}ms (or 504)` },
];

function summarize(json: any, text: string): string {
  if (json === undefined) return `UNPARSEABLE: ${text.slice(0, 60)}...`;
  if (json.status === 'ok') return 'ok';
  if (json.delivery_codes) {
    const pc = json.delivery_codes[0]?.postal_code;
    return pc ? `pin ${pc.pin} pickup=${pc.pickup} remarks="${pc.remarks}"` : 'delivery_codes: [] (NSZ)';
  }
  if (json.shipments?.[0]?.Shipment) {
    const s = json.shipments[0].Shipment;
    return `${s.AWB ?? '?'} ${s.Status?.StatusType ?? '?'} ${s.Status?.Status ?? '?'} | ${s.Status?.Instructions ?? ''}`;
  }
  if (json.shipments) return `success=${JSON.stringify(json.success)} waybill=${json.shipments[0]?.waybill ?? '-'} rmk="${(json.rmk ?? '').slice(0, 70)}"`;
  if (json.quality) return `quality=${json.quality} reason=${json.reason}`;
  if (json.pickup_id) return `pickup_id=${json.pickup_id} status=${json.status}`;
  if ('success' in json) return `success=${json.success} ${json.status ?? ''} ${(json.error ?? '').slice(0, 70)}`;
  return JSON.stringify(json).slice(0, 90);
}

async function main() {
  console.log(`Base URL: ${BASE}   auth: ${TOKEN ? 'Token (set)' : 'none'}\n`);
  let failures = 0;
  for (const step of steps) {
    const path = typeof step.path === 'function' ? step.path() : step.path;
    const body = typeof step.body === 'function' ? step.body() : step.body;
    const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (TOKEN) headers.Authorization = `Token ${TOKEN}`;
    if (step.scenario) headers['X-Mock-Scenario'] = step.scenario;
    const t0 = Date.now();
    let line: string;
    try {
      const res = await fetch(BASE + path, { method: step.method, headers, body, signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) });
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { json = undefined; }
      step.after?.(json);
      line = `${res.status} ${summarize(json, text)}`;
    } catch (e) {
      const name = (e as Error).name;
      line = name === 'TimeoutError' || name === 'AbortError' ? `CLIENT TIMEOUT after ${Date.now() - t0}ms` : `ERROR ${(e as Error).message}`;
      if (!step.scenario?.includes('timeout')) failures++;
    }
    const tag = step.scenario ? ` [${step.scenario}]` : '';
    console.log(`${(step.label + tag).padEnd(52)} ${String(Date.now() - t0).padStart(5)}ms  ${line}\n${''.padEnd(60)}expect: ${step.expect}`);
  }
  if (failures) {
    console.error(`\n${failures} request(s) failed unexpectedly`);
    process.exit(1);
  }
}

main();
