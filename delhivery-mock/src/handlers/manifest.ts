// POST /api/cmu/create.json  — contract: Shipment Manifestation / Creation (S3, S10, S11)

import { DOC_ERRORS, MOCK_TEXT, manifestEnvelope, type ManifestResult, type PaymentMode } from '../contract.js';
import { lookupPincode, serviceableFor } from '../pincodes.js';
import type { Ctx, HandlerResult } from '../types.js';
import { isRecord, journeyFor, mockWaybill, normalizePaymentMode, str } from '../util.js';

type Parsed = { data: unknown } | { status: number; error: string };

/**
 * Documented wrapper: `format=json&data=<json>` (S3 cURL, S10 Q3). The data part may be raw or URL-encoded
 * (S3: "Use URL-encoded payloads instead" for special characters).
 * Lenient by default (MOCK_STRICT_FORMAT=false): also accepts a plain JSON object or {"format":"json","data":...},
 * because generic connector tools usually send JSON. The leniency is reported in `_mock.warnings`.
 */
export function parseManifestBody(ctx: Ctx): Parsed {
  const raw = ctx.rawBody.trim();
  if (!raw) return { status: 400, error: DOC_ERRORS.formatKeyMissing };

  let dataText: string | null = null;
  let parsedObject: unknown;

  if (raw.startsWith('format=')) {
    const m = /^format=([^&]*)&data=([\s\S]*)$/.exec(raw);
    if (!m || m[1]!.toLowerCase() !== 'json') return { status: 400, error: DOC_ERRORS.formatKeyMissing };
    dataText = m[2]!.trim();
    if (!dataText.startsWith('{') && /%[0-9A-Fa-f]{2}/.test(dataText)) {
      try {
        dataText = decodeURIComponent(dataText);
      } catch {
        return { status: 400, error: MOCK_TEXT.invalidJson('data is not valid URL encoding') };
      }
    }
  } else if (raw.startsWith('{')) {
    try {
      parsedObject = JSON.parse(raw);
    } catch (e) {
      return { status: 400, error: MOCK_TEXT.invalidJson((e as Error).message) };
    }
    if (isRecord(parsedObject) && 'data' in parsedObject && str(parsedObject.format).toLowerCase() === 'json') {
      const d = parsedObject.data;
      if (typeof d === 'string') dataText = d;
      else return { data: d };
    } else {
      if (ctx.cfg.strictFormat) return { status: 400, error: DOC_ERRORS.formatKeyMissing };
      ctx.warnings.push(
        'Request accepted without the documented "format=json&data=" wrapper (MOCK_STRICT_FORMAT=false). Real Delhivery returns "format key missing in the post".',
      );
      return { data: parsedObject };
    }
  } else {
    return { status: 400, error: DOC_ERRORS.formatKeyMissing };
  }

  try {
    return { data: JSON.parse(dataText) };
  } catch (e) {
    return { status: 400, error: MOCK_TEXT.invalidJson((e as Error).message) };
  }
}

/** S10: allowed prefixes 91, +91, +91-, 91-, 0 in front of the number (10 digits assumed — mock rule). */
export function validPhone(raw: unknown): boolean {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const p = str(first).replace(/\s/g, '');
  if (/^\d{10}$/.test(p)) return true;
  return ['+91-', '+91', '91-', '91', '0'].some((pre) => p.startsWith(pre) && /^\d{10}$/.test(p.slice(pre.length)));
}

const MANDATORY = ['name', 'order', 'phone', 'add', 'pin', 'payment_mode'] as const;

function fail(order: string | null, mode: string | null, remarks: string): ManifestResult {
  return { order, waybill: null, payment_mode: mode, status: 'Fail', remarks };
}

export function manifest(ctx: Ctx): HandlerResult {
  const parsed = parseManifestBody(ctx);
  if ('error' in parsed) {
    return { status: parsed.status, body: manifestEnvelope([], parsed.error), envelope: 'mock-defined' };
  }
  const payload = parsed.data;
  if (!isRecord(payload) || !Array.isArray(payload.shipments)) {
    return { status: 400, body: manifestEnvelope([], DOC_ERRORS.shipmentsNotList), envelope: 'mock-defined' };
  }
  if (payload.shipments.length === 0) {
    return { status: 400, body: manifestEnvelope([], MOCK_TEXT.emptyShipments), envelope: 'mock-defined' };
  }

  const pl = payload.pickup_location;
  const warehouse = isRecord(pl) ? str(pl.name) : str(pl);
  const warehouseOk = warehouse !== '' && (!ctx.cfg.warehouses || ctx.cfg.warehouses.includes(warehouse));

  const results = payload.shipments.map((item): ManifestResult => {
    if (!isRecord(item)) return fail(null, null, DOC_ERRORS.shipmentsNotList);
    const order = str(item.order) || null;
    const missing = MANDATORY.filter((k) => str(item[k]) === '');
    if (missing.length) return fail(order, str(item.payment_mode) || null, MOCK_TEXT.missingFields(missing));
    const orderId = order!;
    const pin = str(item.pin);

    if (!warehouseOk) return fail(orderId, str(item.payment_mode), DOC_ERRORS.warehouseMissing);
    if (ctx.cfg.clientName && str(item.client) && str(item.client) !== ctx.cfg.clientName) {
      return fail(orderId, str(item.payment_mode), DOC_ERRORS.wrongClient);
    }
    if (orderId.length > 50) return fail(orderId, str(item.payment_mode), DOC_ERRORS.orderIdTooLong);
    const mode: PaymentMode | null = normalizePaymentMode(item.payment_mode);
    if (!mode) return fail(orderId, str(item.payment_mode), DOC_ERRORS.packageTypeNotServiceable(str(item.payment_mode)));
    if (!validPhone(item.phone)) return fail(orderId, mode, DOC_ERRORS.incorrectPhone(orderId));

    const active = ctx.active?.name;
    const pc = lookupPincode(pin, ctx.cfg);
    if (active === 'nsz') {
      ctx.applied = true;
      return fail(orderId, mode, DOC_ERRORS.nonServiceablePin(pin));
    }
    if (!serviceableFor(pc, mode)) return fail(orderId, mode, DOC_ERRORS.nonServiceablePin(pin));

    // Scenario effects, after the request itself has validated.
    if (active === 'low_balance') {
      ctx.applied = true;
      return fail(orderId, mode, DOC_ERRORS.insufficientBalance);
    }
    if (active === 'warehouse_inactive') {
      ctx.applied = true;
      return fail(orderId, mode, DOC_ERRORS.warehouseInactive);
    }
    if (active === 'duplicate_order') {
      ctx.applied = true;
      return fail(orderId, mode, DOC_ERRORS.duplicateOrder);
    }
    if (active === 'no_rider' && mode === 'Pickup') {
      ctx.applied = true;
      return fail(orderId, mode, MOCK_TEXT.noRiderManifest(pin));
    }

    // SPS: waybill may be passed or skipped; when skipped one is generated (S3, S10 Q6).
    const waybill = str(item.waybill) || mockWaybill(orderId, mode);
    ctx.store.put({
      waybill,
      order: orderId,
      paymentMode: mode,
      journey: journeyFor(mode),
      pin,
      city: pc?.city ?? null,
      createdAt: ctx.now(),
      edits: {},
    });
    ctx.log.info('shipment manifested', { waybill, order: orderId, payment_mode: mode });
    return { order: orderId, waybill, payment_mode: mode, status: 'Success', remarks: '' };
  });

  const firstFailure = results.find((r) => r.status === 'Fail');
  return { status: 200, body: manifestEnvelope(results, firstFailure?.remarks ?? ''), envelope: 'mock-defined' };
}
