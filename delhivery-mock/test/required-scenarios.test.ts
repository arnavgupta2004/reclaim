// The scenarios the competition brief / task explicitly requires.

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { createNodeHandler } from '../src/node-adapter.js';
import { call, createRvp, makeApp, manifestBody, rvpShipment, TOKEN } from './helpers.js';

const INSUFFICIENT =
  "Crashing while saving package due to exception 'client manifest charge API failed due to insufficient balance'. Package might have been partially saved.";

describe('1. successful reverse-pickup creation', () => {
  it('manifests an RVP with the documented format=json&data= wrapper and generates a waybill', async () => {
    const app = makeApp();
    const res = await createRvp(app);
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.equal(res.json.rmk, '');
    assert.equal(res.json.shipments.length, 1);
    const s = res.json.shipments[0];
    assert.equal(s.status, 'Success');
    assert.equal(s.order, 'ORD-8500');
    assert.equal(s.payment_mode, 'Pickup');
    assert.match(s.waybill, /^92\d{11}$/); // mock series: 9 + journey digit 2 (reverse pickup)
    assert.equal(res.json._mock.behavior, 'normal');
    assert.equal(res.headers['x-mock-scenario'], 'normal');
  });

  it('is deterministic: same order on a fresh server yields the same waybill and identical body', async () => {
    const a = await createRvp(makeApp());
    const b = await createRvp(makeApp());
    assert.equal(a.json.shipments[0].waybill, b.json.shipments[0].waybill);
    assert.equal(a.text, b.text);
  });

  it('uses a client-supplied waybill when one is passed (documented: SPS waybill may be passed or skipped)', async () => {
    const res = await createRvp(makeApp(), { waybill: '1122345678722' });
    assert.equal(res.json.shipments[0].waybill, '1122345678722');
  });

  it('accepts a URL-encoded data part', async () => {
    const data = encodeURIComponent(JSON.stringify({ shipments: [rvpShipment()], pickup_location: { name: 'WH' } }));
    const res = await call(makeApp(), 'POST', '/api/cmu/create.json', { body: `format=json&data=${data}` });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
  });

  it('accepts plain JSON by default but flags it; strict mode returns the documented "format key missing" error', async () => {
    const body = { shipments: [rvpShipment()], pickup_location: { name: 'WH' } };
    const lenient = await call(makeApp(), 'POST', '/api/cmu/create.json', { body });
    assert.equal(lenient.json.success, true);
    assert.match(lenient.json._mock.warnings[0], /format=json&data=/);

    const strict = await call(makeApp({ MOCK_STRICT_FORMAT: 'true' }), 'POST', '/api/cmu/create.json', { body });
    assert.equal(strict.status, 400);
    assert.equal(strict.json.success, false);
    assert.equal(strict.json.rmk, 'format key missing in the post');
  });
});

describe('2. no rider available (competition-only synthetic failure)', () => {
  it('fails the RVP manifest, clearly labelled as NOT a documented Delhivery error', async () => {
    const res = await createRvp(makeApp(), {}, { 'X-Mock-Scenario': 'no_rider' });
    assert.equal(res.status, 200); // HTTP 200: the agent must read the body, not trust the status code
    assert.equal(res.json.success, false);
    assert.equal(res.json.shipments[0].status, 'Fail');
    assert.equal(res.json.shipments[0].waybill, null);
    assert.match(res.json.rmk, /MOCK SYNTHETIC FAILURE \(not a documented Delhivery error\): no field executive available/);
    assert.equal(res.json._mock.behavior, 'synthetic_competition_failure');
    assert.match(res.json._mock.note, /NOT a documented Delhivery API behaviour/);
    assert.equal(res.headers['x-mock-scenario-applied'], 'true');
  });

  it('can be selected by base-URL path prefix (for AgenticOrg connectors)', async () => {
    const res = await call(makeApp(), 'POST', '/scenario/no_rider/api/cmu/create.json', { body: manifestBody([rvpShipment()]) });
    assert.equal(res.json.success, false);
    assert.equal(res.json._mock.scenario_source, 'path');
  });

  it('can be selected by MOCK_SCENARIO env default', async () => {
    const res = await createRvp(makeApp({ MOCK_SCENARIO: 'no_rider' }));
    assert.equal(res.json.success, false);
    assert.equal(res.json._mock.scenario_source, 'env');
  });

  it('does not affect forward (Prepaid) shipments', async () => {
    const res = await createRvp(makeApp(), { payment_mode: 'Prepaid' }, { 'X-Mock-Scenario': 'no_rider' });
    assert.equal(res.json.success, true);
    assert.equal(res.json._mock.scenario_applied, false);
  });

  it('fails a pickup request (/fm/request/new/)', async () => {
    const res = await call(makeApp(), 'POST', '/fm/request/new/', {
      body: { pickup_time: '11:00:00', pickup_date: '2026-10-05', pickup_location: 'Reclaim Returns WH', expected_package_count: 1 },
      headers: { 'X-Mock-Scenario': 'no_rider' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, false);
    assert.match(res.json.error, /MOCK SYNTHETIC FAILURE/);
    assert.equal(res.json.pickup_id, undefined);
  });

  it('no_rider_after_manifest: manifest succeeds but tracking shows the pickup not done', async () => {
    const app = makeApp();
    const created = await createRvp(app, {}, { 'X-Mock-Scenario': 'no_rider_after_manifest' });
    assert.equal(created.json.success, true); // creation is not pickup
    const wb = created.json.shipments[0].waybill;
    const tr = await call(app, 'GET', `/api/v1/packages/json/?waybill=${wb}`, { headers: { 'X-Mock-Scenario': 'no_rider_after_manifest' } });
    const st = tr.json.shipments[0].Shipment.Status;
    assert.equal(st.StatusType, 'PP');
    assert.equal(st.Status, 'Scheduled');
    assert.match(st.Instructions, /no field executive available/);
    assert.equal(tr.json._mock.behavior, 'synthetic_competition_failure');
  });
});

describe('3. timeout (explicit, controllable)', () => {
  it('holds the response for MOCK_TIMEOUT_MS then returns 504; default requests are fast', async () => {
    const app = makeApp({ MOCK_TIMEOUT_MS: '300' });
    const t0 = Date.now();
    const fast = await createRvp(app);
    assert.ok(Date.now() - t0 < 100, 'default path must not be slow');
    assert.equal(fast.status, 200);

    const t1 = Date.now();
    const slow = await createRvp(app, { order: 'ORD-TIMEOUT' }, { 'X-Mock-Scenario': 'timeout' });
    const elapsed = Date.now() - t1;
    assert.ok(elapsed >= 290, `expected >= 300ms delay, got ${elapsed}`);
    assert.equal(slow.status, 504);
    assert.match(slow.json.error, /simulated upstream timeout/);
    assert.equal(slow.json._mock.behavior, 'synthetic_competition_failure');
  });

  it('a real HTTP client with a shorter timeout gives up; the operation still took effect (track before retrying)', async () => {
    const app = makeApp({ MOCK_TIMEOUT_MS: '800' });
    const server = createServer(createNodeHandler(app)).listen(0);
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      await assert.rejects(
        fetch(`${base}/scenario/timeout/api/cmu/create.json`, {
          method: 'POST',
          headers: { Authorization: `Token ${TOKEN}`, 'Content-Type': 'application/json' },
          body: manifestBody([rvpShipment({ order: 'ORD-T1' })]),
          signal: AbortSignal.timeout(150),
        }),
        (e: Error) => e.name === 'TimeoutError' || e.name === 'AbortError',
      );
      // The order was processed despite the lost response: tracking by order id finds it.
      const tr = await fetch(`${base}/api/v1/packages/json/?ref_ids=ORD-T1`, { headers: { Authorization: `Token ${TOKEN}` } });
      const body = (await tr.json()) as any;
      assert.equal(tr.status, 200);
      assert.equal(body.shipments[0].Shipment.ReferenceNo, 'ORD-T1');
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});

describe('4. malformed response', () => {
  it('malformed: HTTP 200 + JSON content-type, but the body does not parse and carries no _mock hint', async () => {
    const res = await createRvp(makeApp(), {}, { 'X-Mock-Scenario': 'malformed' });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type']!, /application\/json/);
    assert.throws(() => JSON.parse(res.text));
    assert.ok(!res.text.includes('_mock'));
    assert.equal(res.headers['x-mock-scenario'], 'malformed');
    assert.equal(res.text, (await createRvp(makeApp(), {}, { 'X-Mock-Scenario': 'malformed' })).text, 'deterministic');
  });

  it('malformed_fields: valid JSON, but waybill/status are missing and success is a string', async () => {
    const res = await createRvp(makeApp(), {}, { 'X-Mock-Scenario': 'malformed_fields' });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, 'true'); // wrong type
    assert.equal(res.json.shipments[0].waybill, undefined);
    assert.equal(res.json.shipments[0].status, undefined);
    assert.equal(res.json._mock, undefined);
  });

  it('applies to tracking too', async () => {
    const app = makeApp();
    const wb = (await createRvp(app)).json.shipments[0].waybill;
    const res = await call(app, 'GET', `/api/v1/packages/json/?waybill=${wb}`, { headers: { 'X-Mock-Scenario': 'malformed_fields' } });
    assert.equal(res.json.shipments[0].Shipment.Status, undefined);
    assert.equal(res.json.shipments[0].Shipment.AWB, undefined);
  });
});

describe('5. invalid / unserviceable address or pincode', () => {
  it('pincode API: invalid pin returns the documented empty list', async () => {
    for (const pin of ['999999', '12345', 'abcdef']) {
      const res = await call(makeApp(), 'GET', `/c/api/pin-codes/json/?filter_codes=${pin}`);
      assert.equal(res.status, 200);
      assert.deepEqual(res.json.delivery_codes, []);
    }
  });

  it('pincode API: embargoed pin returns remarks "Embargo" (documented temporary NSZ)', async () => {
    const res = await call(makeApp(), 'GET', '/c/api/pin-codes/json/?filter_codes=744101');
    assert.equal(res.json.delivery_codes[0].postal_code.remarks, 'Embargo');
  });

  it('manifest to a non-serviceable pin returns the documented NSZ error', async () => {
    const res = await createRvp(makeApp(), { pin: '999999' });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, false);
    assert.equal(
      res.json.rmk,
      "Crashing while saving package due to exception '999999 is non serviceable pincode'. Package might have been partially saved.",
    );
    assert.equal(res.json._mock.behavior, 'normal'); // data-driven, not a forced scenario
  });

  it('documented pin 400064 has pickup "N": reverse pickup is refused, prepaid delivery is accepted', async () => {
    const rvp = await createRvp(makeApp(), { pin: '400064' });
    assert.equal(rvp.json.success, false);
    assert.match(rvp.json.rmk, /'400064 is non serviceable pincode'/);
    const fwd = await createRvp(makeApp(), { pin: '400064', payment_mode: 'Prepaid' });
    assert.equal(fwd.json.success, true);
  });

  it('nsz scenario forces non-serviceability on both pincode and manifest endpoints', async () => {
    const app = makeApp();
    const pc = await call(app, 'GET', '/c/api/pin-codes/json/?filter_codes=122003', { headers: { 'X-Mock-Scenario': 'nsz' } });
    assert.deepEqual(pc.json.delivery_codes, []);
    assert.equal(pc.json._mock.behavior, 'documented_delhivery_error');
    const mf = await createRvp(app, {}, { 'X-Mock-Scenario': 'nsz' });
    assert.match(mf.json.rmk, /non serviceable pincode/);
  });

  it('address validation: junk address -> quality not_ok / invalid_or_junk (documented enums)', async () => {
    const res = await call(makeApp(), 'POST', '/validate', { body: { address: 'asdf 1', req_id: 'R1' } });
    assert.equal(res.status, 200);
    assert.equal(res.json.quality, 'not_ok');
    assert.equal(res.json.reason, 'invalid_or_junk');
    assert.equal(res.json.formatted_address, '');
    assert.equal(res.json.req_id, 'R1');
  });

  it('address validation: missing pincode -> incomplete; bad_address scenario forces invalid_or_junk', async () => {
    const inc = await call(makeApp(), 'POST', '/validate', { body: { address: 'flat 4b lotus apartments sector 45 gurgaon' } });
    assert.equal(inc.json.quality, 'not_ok');
    assert.equal(inc.json.reason, 'incomplete');
    const bad = await call(makeApp(), 'POST', '/validate', {
      body: { address: 'H-36 1st floor residency greens sector 46 gurgaon 122003' },
      headers: { 'X-Mock-Scenario': 'bad_address' },
    });
    assert.equal(bad.json.reason, 'invalid_or_junk');
    assert.equal(bad.json._mock.behavior, 'documented_delhivery_error');
  });
});

describe('6. successful tracking', () => {
  it('tracks a freshly created RVP: documented Shipment keys, PP Scheduled, ReferenceNo = order', async () => {
    const app = makeApp();
    const wb = (await createRvp(app)).json.shipments[0].waybill;
    const res = await call(app, 'GET', `/api/v1/packages/json/?waybill=${wb}&ref_ids=`);
    assert.equal(res.status, 200);
    const sh = res.json.shipments[0].Shipment;
    assert.deepEqual(Object.keys(sh), ['Status', 'PickUpDate', 'NSLCode', 'Sortcode', 'ReferenceNo', 'AWB']);
    assert.deepEqual(Object.keys(sh.Status), ['Status', 'StatusDateTime', 'StatusType', 'StatusLocation', 'Instructions']);
    assert.equal(sh.AWB, wb);
    assert.equal(sh.ReferenceNo, 'ORD-8500');
    assert.equal(sh.Status.StatusType, 'PP');
    assert.equal(sh.Status.Status, 'Scheduled');
    // fixed clock 12:00 IST; stage index 1 (Scheduled) is spaced +2h after creation
    assert.equal(sh.Status.StatusDateTime, '2026-10-04T14:00:00.000');
    assert.equal(sh.Status.StatusLocation, 'Gurugram_Mock_DC (Gurugram)');
  });

  it('tracks by ref_ids (order id)', async () => {
    const app = makeApp();
    const wb = (await createRvp(app)).json.shipments[0].waybill;
    const res = await call(app, 'GET', '/api/v1/packages/json/?ref_ids=ORD-8500');
    assert.equal(res.json.shipments[0].Shipment.AWB, wb);
  });

  it('stateless: a mock waybill is still trackable on a fresh instance (serverless cold start)', async () => {
    const wb = (await createRvp(makeApp())).json.shipments[0].waybill;
    const res = await call(makeApp(), 'GET', `/api/v1/packages/json/?waybill=${wb}`);
    assert.equal(res.json.shipments[0].Shipment.Status.Status, 'Scheduled');
    assert.equal(res.json.shipments[0].Shipment.ReferenceNo, null); // order id not derivable from the waybill
  });

  it('stage scenarios walk the documented reverse lifecycle up to DL DTO', async () => {
    const app = makeApp();
    const wb = (await createRvp(app)).json.shipments[0].waybill;
    const expected: Array<[string, string, string]> = [
      ['rvp_open', 'PP', 'Open'],
      ['rvp_fe_dispatched', 'PP', 'Dispatched'],
      ['rvp_in_transit', 'PU', 'In Transit'],
      ['rvp_pending', 'PU', 'Pending'],
      ['rvp_out_to_client', 'PU', 'Dispatched'],
      ['rvp_dto', 'DL', 'DTO'],
      ['rvp_canceled', 'CN', 'Canceled'],
    ];
    for (const [scenario, type, status] of expected) {
      const res = await call(app, 'GET', `/api/v1/packages/json/?waybill=${wb}`, { headers: { 'X-Mock-Scenario': scenario } });
      assert.equal(res.json.shipments[0].Shipment.Status.StatusType, type, scenario);
      assert.equal(res.json.shipments[0].Shipment.Status.Status, status, scenario);
      assert.equal(res.json._mock.behavior, 'documented_tracking_status');
    }
  });

  it('MOCK_PROGRESS_SECONDS auto-advances the stage with time', async () => {
    let now = new Date('2026-10-04T06:30:00Z');
    const { createApp } = await import('../src/app.js');
    const { loadConfig } = await import('../src/config.js');
    const { createLogger } = await import('../src/logger.js');
    const app = createApp({ cfg: loadConfig({ MOCK_PROGRESS_SECONDS: '60' }), logger: createLogger('silent'), now: () => now });
    const wb = (await call(app, 'POST', '/api/cmu/create.json', { body: manifestBody([rvpShipment()]), auth: null })).json
      .shipments[0].waybill;
    const at = async () => (await call(app, 'GET', `/api/v1/packages/json/?waybill=${wb}`, { auth: null })).json.shipments[0].Shipment.Status;
    assert.equal((await at()).Status, 'Scheduled');
    now = new Date(now.getTime() + 61_000);
    assert.equal((await at()).Status, 'Dispatched');
    now = new Date(now.getTime() + 3600_000);
    assert.deepEqual([(await at()).StatusType, (await at()).Status], ['DL', 'DTO']);
  });
});

describe('7. unknown shipment', () => {
  it('unknown waybill returns the documented "Data does not exists" error', async () => {
    const res = await call(makeApp(), 'GET', '/api/v1/packages/json/?waybill=1234567890123');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json).filter((k) => k !== '_mock'), ['error']);
    assert.equal(res.json.error, 'Data does not exists for provided Waybill(s)');
  });

  it('unknown order id returns the documented "No such waybill or order ID found" error', async () => {
    const res = await call(makeApp(), 'GET', '/api/v1/packages/json/?ref_ids=ORD-NOPE');
    assert.equal(res.json.error, 'No such waybill or order ID found');
  });

  it('unknown_waybill scenario forces the documented error even for a real waybill', async () => {
    const app = makeApp();
    const wb = (await createRvp(app)).json.shipments[0].waybill;
    const res = await call(app, 'GET', `/api/v1/packages/json/?waybill=${wb}`, { headers: { 'X-Mock-Scenario': 'unknown_waybill' } });
    assert.equal(res.json.error, 'Data does not exists for provided Waybill(s)');
  });
});

describe('low balance (documented Delhivery error)', () => {
  it('manifest returns the exact documented insufficient-balance text in rmk', async () => {
    const res = await createRvp(makeApp(), {}, { 'X-Mock-Scenario': 'low_balance' });
    assert.equal(res.status, 200);
    assert.equal(res.json.success, false);
    assert.equal(res.json.rmk, INSUFFICIENT);
    assert.equal(res.json._mock.behavior, 'documented_delhivery_error');
    assert.match(res.json._mock.source, /LOW BALANCE/);
  });

  it('pickup request returns the same documented text', async () => {
    const res = await call(makeApp(), 'POST', '/fm/request/new/', {
      body: { pickup_time: '11:00:00', pickup_date: '2026-10-05', pickup_location: 'WH', expected_package_count: 2 },
      headers: { 'X-Mock-Scenario': 'low_balance' },
    });
    assert.equal(res.json.success, false);
    assert.equal(res.json.error, INSUFFICIENT);
  });
});
