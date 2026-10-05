// Contract details per endpoint, auth, routing and the remaining documented errors.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { call, createRvp, makeApp, manifestBody, rvpShipment, TOKEN } from './helpers.js';

describe('pincode serviceability', () => {
  it('returns the documented 400064 record exactly (S10 Q2 sample)', async () => {
    const res = await call(makeApp(), 'GET', '/c/api/pin-codes/json/?filter_codes=400064');
    assert.equal(res.status, 200);
    const { _mock, ...body } = res.json;
    assert.deepEqual(body, {
      delivery_codes: [
        {
          postal_code: {
            city: 'Mumbai', cod: 'N', inc: 'Mumbai MIDC (Maharashtra)', district: 'Mumbai', pin: 400064,
            max_amount: 0.0, pre_paid: 'Y', cash: 'Y', state_code: 'MH', max_weight: 0.0, pickup: 'N', repl: 'Y',
            covid_zone: null, country_code: 'IN', is_oda: 'N', remarks: '',
          },
        },
      ],
    });
    assert.equal(_mock.envelope, 'documented by Delhivery');
  });

  it('serviceable pin with blank remarks; without filter_codes returns the whole dataset', async () => {
    const one = await call(makeApp(), 'GET', '/c/api/pin-codes/json/?filter_codes=580001');
    assert.equal(one.json.delivery_codes[0].postal_code.remarks, '');
    assert.equal(one.json.delivery_codes[0].postal_code.pickup, 'Y');
    const all = await call(makeApp(), 'GET', '/c/api/pin-codes/json/');
    assert.ok(all.json.delivery_codes.length >= 5);
  });

  it('unknown valid pins: serviceable by default, NSZ with MOCK_UNKNOWN_PINCODES=nsz', async () => {
    const a = await call(makeApp(), 'GET', '/c/api/pin-codes/json/?filter_codes=411001');
    assert.equal(a.json.delivery_codes.length, 1);
    const b = await call(makeApp({ MOCK_UNKNOWN_PINCODES: 'nsz' }), 'GET', '/c/api/pin-codes/json/?filter_codes=411001');
    assert.deepEqual(b.json.delivery_codes, []);
  });
});

describe('manifest validation (documented error strings)', () => {
  const cases: Array<[string, Record<string, unknown>, string | RegExp]> = [
    ['bad phone', { phone: '12345' }, 'Incorrect phone number(s) for order ORD-8500'],
    ['order id > 50 chars', { order: 'X'.repeat(51) }, /oid does not pass the validator <lambda>/],
    ['unknown payment mode', { payment_mode: 'Barter' }, /Package type Barter not serviceable for this account/],
    ['missing mandatory fields', { name: '', add: '' }, 'MOCK: missing mandatory field(s): name, add'],
  ];
  for (const [label, over, expected] of cases) {
    it(label, async () => {
      const res = await createRvp(makeApp(), over);
      assert.equal(res.status, 200);
      assert.equal(res.json.success, false);
      if (typeof expected === 'string') assert.equal(res.json.rmk, expected);
      else assert.match(res.json.rmk, expected);
    });
  }

  it('accepts all documented phone prefixes', async () => {
    for (const phone of ['9876543210', '919876543210', '+919876543210', '+91-9876543210', '91-9876543210', '09876543210']) {
      const res = await createRvp(makeApp(), { phone });
      assert.equal(res.json.success, true, phone);
    }
  });

  it('shipments not a list -> documented error; missing wrapper JSON -> 400', async () => {
    const res = await call(makeApp(), 'POST', '/api/cmu/create.json', { body: 'format=json&data={"shipments":{"a":1}}' });
    assert.equal(res.status, 400);
    assert.equal(res.json.rmk, "Error message is 'unicode' object has no attribute 'get'.");
    const bad = await call(makeApp(), 'POST', '/api/cmu/create.json', { body: 'format=json&data={"shipments":[' });
    assert.equal(bad.status, 400);
    assert.match(bad.json.rmk, /^MOCK: request body is not valid JSON/);
  });

  it('pickup_location: missing or unregistered -> documented warehouse error', async () => {
    const missing = await call(makeApp(), 'POST', '/api/cmu/create.json', {
      body: 'format=json&data=' + JSON.stringify({ shipments: [rvpShipment()] }),
    });
    assert.equal(missing.json.rmk, 'ClientWarehouse matching query does not exist.');
    const app = makeApp({ MOCK_WAREHOUSE_NAMES: 'Reclaim Returns WH' });
    assert.equal((await call(app, 'POST', '/api/cmu/create.json', { body: manifestBody([rvpShipment()], 'Other WH') })).json.success, false);
    assert.equal((await call(app, 'POST', '/api/cmu/create.json', { body: manifestBody([rvpShipment()]) })).json.success, true);
  });

  it('client name check when MOCK_CLIENT_NAME is set', async () => {
    const res = await createRvp(makeApp({ MOCK_CLIENT_NAME: 'RECLAIM' }), { client: 'someone-else' });
    assert.equal(res.json.rmk, 'shipment list contains no data');
  });

  it('documented scenarios: duplicate_order, warehouse_inactive', async () => {
    const d = await createRvp(makeApp(), {}, { 'X-Mock-Scenario': 'duplicate_order' });
    assert.equal(d.json.rmk, 'Duplicate Order Id');
    const w = await createRvp(makeApp(), {}, { 'X-Mock-Scenario': 'warehouse_inactive' });
    assert.equal(w.json.rmk, 'Client-Warehouse is not active.');
  });

  it('multiple shipments: per-shipment status, overall success only if all succeed', async () => {
    const res = await call(makeApp(), 'POST', '/api/cmu/create.json', {
      body: manifestBody([rvpShipment({ order: 'A-1' }), rvpShipment({ order: 'A-2', pin: '999999' })]),
    });
    assert.equal(res.json.success, false);
    assert.deepEqual(res.json.shipments.map((s: any) => s.status), ['Success', 'Fail']);
  });
});

describe('pickup request creation', () => {
  const body = { pickup_time: '11:00:00', pickup_date: '2026-10-05', pickup_location: 'Reclaim Returns WH', expected_package_count: 1 };

  it('success: deterministic pickup_id and documented "Scheduled" status', async () => {
    const a = await call(makeApp(), 'POST', '/fm/request/new/', { body });
    const b = await call(makeApp(), 'POST', '/fm/request/new/', { body });
    assert.equal(a.status, 200);
    assert.equal(a.json.success, true);
    assert.equal(a.json.status, 'Scheduled');
    assert.equal(typeof a.json.pickup_id, 'number');
    assert.equal(a.json.pickup_id, b.json.pickup_id);
  });

  it('documented date errors', async () => {
    const past = await call(makeApp(), 'POST', '/fm/request/new/', { body: { ...body, pickup_date: '2026-10-03' } });
    assert.equal(past.status, 400);
    assert.deepEqual(Object.keys(past.json).filter((k) => k !== '_mock'), ['pickup_date']);
    assert.equal(past.json.pickup_date, 'Pickup date cannot be in past');
    const far = await call(makeApp(), 'POST', '/fm/request/new/', { body: { ...body, pickup_date: '2026-10-12' } });
    assert.equal(far.json.error, 'Pickup date should not be more than 7 days from pickup creation date');
    const today = await call(makeApp(), 'POST', '/fm/request/new/', { body: { ...body, pickup_date: '2026-10-04' } });
    assert.equal(today.json.success, true);
  });

  it('missing fields -> 400', async () => {
    const res = await call(makeApp(), 'POST', '/fm/request/new/', { body: { pickup_date: '2026-10-05' } });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /pickup_time, pickup_location, expected_package_count/);
  });

  it('documented scenarios: pickup_already_exists, auto_pickup; invalid location', async () => {
    const ex = await call(makeApp(), 'POST', '/fm/request/new/', { body, headers: { 'X-Mock-Scenario': 'pickup_already_exists' } });
    assert.match(ex.json.error, /^A Pickup Request \d+ for this Pickup Location Already Exist\.$/);
    const auto = await call(makeApp(), 'POST', '/fm/request/new/', { body, headers: { 'X-Mock-Scenario': 'auto_pickup' } });
    assert.equal(auto.json.error, 'Client is on auto pickup and please raise a ticket to firstmile_servicing@delhivery.com');
    const loc = await call(makeApp({ MOCK_WAREHOUSE_NAMES: 'X' }), 'POST', '/fm/request/new/', { body });
    assert.equal(loc.json.error, 'Invalid Pickup Location ClientWarehouse matching query does not exist.');
  });
});

describe('edit / cancel (/api/p/edit)', () => {
  it('cancels a Scheduled RVP; tracking then shows CN Canceled (documented outcome)', async () => {
    const app = makeApp();
    const wb = (await createRvp(app)).json.shipments[0].waybill;
    const res = await call(app, 'POST', '/api/p/edit', { body: { waybill: wb, cancellation: 'true' } });
    assert.equal(res.status, 200);
    assert.deepEqual([res.json.success, res.json.status], [true, 'Canceled']);
    const tr = await call(app, 'GET', `/api/v1/packages/json/?waybill=${wb}`);
    assert.deepEqual([tr.json.shipments[0].Shipment.Status.StatusType, tr.json.shipments[0].Shipment.Status.Status], ['CN', 'Canceled']);
    assert.equal(tr.json.shipments[0].Shipment.NSLCode, 'EOD-21');
  });

  it('refuses to cancel an RVP that is past Scheduled (documented rule)', async () => {
    const app = makeApp();
    const wb = (await createRvp(app)).json.shipments[0].waybill;
    const res = await call(app, 'POST', '/api/p/edit', { body: { waybill: wb, cancellation: 'true' }, headers: { 'X-Mock-Scenario': 'rvp_in_transit' } });
    assert.equal(res.json.success, false);
    assert.equal(res.json.status, 'In Transit');
    assert.match(res.json.error, /reverse pickups only in Scheduled/);
  });

  it('forward cancellation: Manifested stays Manifested; In Transit becomes RT In Transit', async () => {
    const app = makeApp();
    const wb = (await createRvp(app, { payment_mode: 'Prepaid', order: 'F-1' })).json.shipments[0].waybill;
    const m = await call(app, 'POST', '/api/p/edit', { body: { waybill: wb, cancellation: 'true' } });
    assert.equal(m.json.status, 'Manifested');
    const wb2 = (await createRvp(app, { payment_mode: 'Prepaid', order: 'F-2' })).json.shipments[0].waybill;
    const t = await call(app, 'POST', '/api/p/edit', { body: { waybill: wb2, cancellation: 'true' }, headers: { 'X-Mock-Scenario': 'fwd_in_transit' } });
    assert.equal(t.json.status, 'In Transit');
    const tr = await call(app, 'GET', `/api/v1/packages/json/?waybill=${wb2}`);
    assert.equal(tr.json.shipments[0].Shipment.Status.StatusType, 'RT');
  });

  it('edits allowed fields; refuses Pickup -> COD conversion (documented rule)', async () => {
    const app = makeApp();
    const wb = (await createRvp(app)).json.shipments[0].waybill;
    const ok = await call(app, 'POST', '/api/p/edit', { body: { waybill: wb, add: 'New address 12', phone: '9876500000' } });
    assert.deepEqual([ok.json.success, ok.json.updated_fields], [true, ['phone', 'add']]);
    const conv = await call(app, 'POST', '/api/p/edit', { body: { waybill: wb, pt: 'COD' } });
    assert.equal(conv.json.success, false);
    assert.match(conv.json.error, /Pickup -> COD is not allowed/);
  });

  it('unknown waybill', async () => {
    const res = await call(makeApp(), 'POST', '/api/p/edit', { body: { waybill: '1111', cancellation: 'true' } });
    assert.equal(res.json.success, false);
    assert.equal(res.json.error, 'MOCK: waybill not found for this account');
  });
});

describe('address validation (Delhivery Maps /validate)', () => {
  it('good address -> documented response shape, quality ok', async () => {
    const res = await call(makeApp(), 'POST', '/validate', {
      body: { address: 'H-36 1st floor residency greens sector 46 gurgaon 122003', req_id: 'ORDER-12345' },
    });
    assert.equal(res.status, 200);
    const { _mock, ...body } = res.json;
    assert.deepEqual(Object.keys(body), ['quality', 'granularity_level', 'reason', 'formatted_address', 'corrections', 'request_id', 'req_id']);
    assert.equal(body.quality, 'ok');
    assert.equal(body.granularity_level, 'PREMISE');
    assert.equal(body.reason, 'valid');
    assert.equal(body.formatted_address, 'H-36 1st Floor Residency Greens Sector 46 Gurgaon, Gurugram, 122003');
    assert.match(body.request_id, /^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it('accepts Bearer auth (documented Maps scheme) and omits req_id when not sent', async () => {
    const res = await call(makeApp(), 'POST', '/validate', {
      body: { address: 'House 12 MG Road Bengaluru 560001' },
      auth: `Bearer ${TOKEN}`,
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.req_id, undefined);
  });

  it('missing address -> 400', async () => {
    const res = await call(makeApp(), 'POST', '/validate', { body: {} });
    assert.equal(res.status, 400);
  });
});

describe('auth, routing, scenario selection, metadata', () => {
  it('missing token -> 401 documented text; wrong token -> 401 documented text', async () => {
    const none = await call(makeApp(), 'GET', '/c/api/pin-codes/json/?filter_codes=122003', { auth: null });
    assert.equal(none.status, 401);
    assert.equal(none.json.error, 'Authentication credentials were not provided');
    const wrong = await call(makeApp(), 'GET', '/c/api/pin-codes/json/?filter_codes=122003', { auth: 'Token nope' });
    assert.equal(wrong.json.error, 'Login or API Key Required');
    const bearer = await call(makeApp(), 'GET', '/c/api/pin-codes/json/?filter_codes=122003', { auth: `Bearer ${TOKEN}` });
    assert.equal(bearer.status, 401, 'B2C endpoints require the documented Token scheme');
  });

  it('MOCK_ACCEPT_ALT_AUTH=true also accepts Bearer and X-API-Key (still rejects wrong values)', async () => {
    const app = makeApp({ MOCK_ACCEPT_ALT_AUTH: 'true' });
    const url = '/c/api/pin-codes/json/?filter_codes=122003';
    assert.equal((await call(app, 'GET', url, { auth: `Bearer ${TOKEN}` })).status, 200);
    assert.equal((await call(app, 'GET', url, { auth: null, headers: { 'X-API-Key': TOKEN } })).status, 200);
    assert.equal((await call(app, 'GET', url, { auth: null, headers: { 'X-API-Key': 'nope' } })).status, 401);
  });

  it('/openapi.json lists the documented paths and reflects a scenario base-URL prefix', async () => {
    const res = await call(makeApp(), 'GET', '/scenario/no_rider/openapi.json', { auth: null, headers: { host: 'mock.example' } });
    assert.equal(res.status, 200);
    assert.equal(res.json.servers[0].url, 'http://mock.example/scenario/no_rider');
    assert.deepEqual(Object.keys(res.json.paths), [
      '/c/api/pin-codes/json/', '/api/cmu/create.json', '/fm/request/new/', '/api/v1/packages/json/', '/api/p/edit', '/validate',
    ]);
  });

  it('no token configured -> auth not enforced', async () => {
    const res = await call(makeApp({ MOCK_API_TOKEN: '' }), 'GET', '/c/api/pin-codes/json/?filter_codes=122003', { auth: null });
    assert.equal(res.status, 200);
  });

  it('/health and / need no auth and never expose the token', async () => {
    const app = makeApp();
    for (const path of ['/health', '/']) {
      const res = await call(app, 'GET', path, { auth: null });
      assert.equal(res.status, 200);
      assert.ok(!res.text.includes(TOKEN));
    }
    const index = await call(app, 'GET', '/', { auth: null });
    assert.equal(index.json.auth_enforced, true);
    assert.ok(index.json.scenarios.some((s: any) => s.name === 'no_rider' && s.kind === 'synthetic'));
  });

  it('unknown route 404, wrong method 405, unknown scenario 400', async () => {
    const app = makeApp();
    assert.equal((await call(app, 'GET', '/api/does/not/exist')).status, 404);
    const m = await call(app, 'GET', '/api/cmu/create.json');
    assert.equal(m.status, 405);
    assert.equal(m.headers.allow, 'POST');
    const s = await call(app, 'GET', '/c/api/pin-codes/json/?filter_codes=122003', { headers: { 'X-Mock-Scenario': 'nope' } });
    assert.equal(s.status, 400);
    assert.ok(s.json.valid_scenarios.includes('timeout'));
  });

  it('header beats path prefix; trailing slash optional', async () => {
    const res = await call(makeApp(), 'GET', '/scenario/nsz/c/api/pin-codes/json?filter_codes=122003', { headers: { 'X-Mock-Scenario': 'normal' } });
    assert.equal(res.json.delivery_codes.length, 1);
    assert.equal(res.json._mock.scenario_source, 'header');
  });

  it('rate_limited -> 403 with documented text', async () => {
    const res = await call(makeApp(), 'GET', '/api/v1/packages/json/?waybill=9200000000000', { headers: { 'X-Mock-Scenario': 'rate_limited' } });
    assert.equal(res.status, 403);
    assert.equal(res.json.error, '403 Forbidden');
  });

  it('MOCK_INCLUDE_META=false removes _mock from bodies (headers still say the scenario)', async () => {
    const res = await createRvp(makeApp({ MOCK_INCLUDE_META: 'false' }), {}, { 'X-Mock-Scenario': 'no_rider' });
    assert.equal(res.json._mock, undefined);
    assert.equal(res.headers['x-mock-scenario'], 'no_rider');
    assert.match(res.json.rmk, /MOCK SYNTHETIC FAILURE/); // the synthetic label stays in the message itself
  });
});
