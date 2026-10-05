// POST /api/p/edit  — contract: Shipment Cancellation (S5) and Shipment Updation (S4)

import { EDITABLE_FIELDS, EDITABLE_STATUSES, MOCK_TEXT, type PaymentMode } from '../contract.js';
import { currentStage, resolveWaybill, type ResolvedShipment } from '../shipments.js';
import type { ShipmentRecord } from '../store.js';
import type { Ctx, HandlerResult } from '../types.js';
import { isRecord, normalizePaymentMode, str } from '../util.js';

function result(status: number, body: Record<string, unknown>): HandlerResult {
  return { status, body, envelope: 'mock-defined' };
}

function ensureRecord(ctx: Ctx, s: ResolvedShipment): ShipmentRecord {
  if (s.record) return s.record;
  const rec: ShipmentRecord = {
    waybill: s.waybill,
    order: s.order ?? '',
    paymentMode: s.paymentMode,
    journey: s.journey,
    pin: '',
    city: s.city,
    createdAt: ctx.now(),
    edits: {},
  };
  ctx.store.put(rec);
  return rec;
}

/** S4 payment-mode conversion rules. Returns an error message or null when allowed. */
function conversionError(from: PaymentMode, to: PaymentMode, body: Record<string, unknown>): string | null {
  const allowed = (from === 'COD' && to === 'Prepaid') || (from === 'Prepaid' && to === 'COD');
  if (!allowed) return MOCK_TEXT.paymentConversionNotAllowed(from, to);
  if (from === 'Prepaid' && to === 'COD' && str(body.cod) === '') {
    return 'MOCK: Prepaid -> COD conversion requires a COD amount (documented rule, Shipment Updation)';
  }
  return null;
}

export function edit(ctx: Ctx): HandlerResult {
  let body: unknown;
  try {
    body = JSON.parse(ctx.rawBody || '{}');
  } catch (e) {
    return result(400, { success: false, error: MOCK_TEXT.invalidJson((e as Error).message) });
  }
  if (!isRecord(body)) return result(400, { success: false, error: MOCK_TEXT.invalidJson('expected a JSON object') });

  const waybill = str(body.waybill);
  if (!waybill) return result(400, { success: false, error: MOCK_TEXT.missingFields(['waybill']) });
  if (ctx.active?.name === 'unknown_waybill') {
    ctx.applied = true;
    return result(200, { success: false, waybill, error: MOCK_TEXT.waybillNotFound });
  }
  const s = resolveWaybill(ctx, waybill);
  if (!s) return result(200, { success: false, waybill, error: MOCK_TEXT.waybillNotFound });

  const { stage } = currentStage(ctx, s);
  const expectedType = s.journey === 'reverse' ? 'PP' : 'UD';
  if (stage.statusType !== expectedType || !EDITABLE_STATUSES[s.journey].includes(stage.status)) {
    return result(200, { success: false, waybill, status: stage.status, error: MOCK_TEXT.editNotAllowed(stage.status, s.journey) });
  }

  const rec = ensureRecord(ctx, s);
  if (str(body.cancellation).toLowerCase() === 'true') {
    // Documented outcomes (S5).
    let newStatus = stage.status;
    if (s.journey === 'reverse') {
      rec.stageOverride = 'rvp_canceled';
      newStatus = 'Canceled';
    } else if (stage.status === 'In Transit' || stage.status === 'Pending') {
      rec.stageOverride = 'fwd_rt_in_transit';
      newStatus = 'In Transit';
    }
    rec.canceledAt = ctx.now();
    ctx.log.info('shipment cancelled', { waybill });
    return result(200, { success: true, waybill, status: newStatus, remark: 'MOCK: cancellation accepted' });
  }

  const updates = Object.fromEntries(EDITABLE_FIELDS.filter((k) => k in body).map((k) => [k, body[k]]));
  if (!Object.keys(updates).length) {
    return result(400, { success: false, waybill, error: `MOCK: no editable fields supplied (allowed: ${EDITABLE_FIELDS.join(', ')}, or cancellation)` });
  }
  if ('pt' in updates) {
    const to = normalizePaymentMode(updates.pt);
    if (!to) return result(200, { success: false, waybill, error: `MOCK: unknown payment mode "${str(updates.pt)}"` });
    const conv = conversionError(s.paymentMode, to, body);
    if (conv) return result(200, { success: false, waybill, error: conv });
  }
  Object.assign(rec.edits, updates);
  ctx.log.info('shipment edited', { waybill, fields: Object.keys(updates) });
  return result(200, { success: true, waybill, status: stage.status, updated_fields: Object.keys(updates), remark: 'MOCK: shipment updated' });
}
