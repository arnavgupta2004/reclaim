// GET /api/v1/packages/json/?waybill=<wb[,wb...]>&ref_ids=<order>  — contract: Shipment Tracking (S6, S9, S10)

import { DOC_ERRORS, trackingEnvelope } from '../contract.js';
import { currentStage, resolveWaybill, shipmentObject, type ResolvedShipment } from '../shipments.js';
import type { Ctx, HandlerResult } from '../types.js';

const MAX_WAYBILLS = 50; // S6 / S10: up to 50 comma-separated waybills per request

function list(v: string | null): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function tracking(ctx: Ctx): HandlerResult {
  if (ctx.active?.name === 'rate_limited') {
    ctx.applied = true;
    return { status: 403, body: { error: DOC_ERRORS.forbidden }, envelope: 'mock-defined' };
  }

  const waybills = list(ctx.query.get('waybill'));
  const refs = list(ctx.query.get('ref_ids'));
  if (!waybills.length && !refs.length) {
    return { status: 400, body: { error: 'MOCK: waybill or ref_ids is required' }, envelope: 'mock-defined' };
  }
  if (waybills.length > MAX_WAYBILLS) {
    return { status: 400, body: { error: `MOCK: at most ${MAX_WAYBILLS} waybills per request` }, envelope: 'mock-defined' };
  }
  if (ctx.active?.name === 'unknown_waybill') {
    ctx.applied = true;
    return { status: 200, body: { error: DOC_ERRORS.trackNoData }, envelope: 'mock-defined' };
  }

  const found: { s: ResolvedShipment; ref: string | null }[] = [];
  if (waybills.length) {
    for (const wb of waybills) {
      const s = resolveWaybill(ctx, wb);
      if (s) found.push({ s, ref: null });
    }
  } else {
    // ref_ids lookups use this instance's memory (order -> waybill); waybill lookups are stateless.
    for (const ref of refs) {
      const wb = ctx.store.waybillForOrder(ref);
      const s = wb ? resolveWaybill(ctx, wb) : null;
      if (s) found.push({ s, ref });
    }
  }

  if (!found.length) {
    const error = waybills.length ? DOC_ERRORS.trackNoData : DOC_ERRORS.trackNotFound;
    return { status: 200, body: { error }, envelope: 'mock-defined' };
  }
  const shipments = found.map(({ s, ref }) => shipmentObject(ctx, s, currentStage(ctx, s), ref));
  return { status: 200, body: trackingEnvelope(shipments), envelope: 'mock-defined' };
}
