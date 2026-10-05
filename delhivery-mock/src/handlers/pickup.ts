// POST /fm/request/new/  — contract: Pickup Request Creation (S7, S10, S17)
// Note (documented, S10 Q2): pickup requests are NOT needed for reverse shipments; they are scheduled automatically.

import { DOC_ERRORS, MOCK_TEXT } from '../contract.js';
import type { Ctx, HandlerResult } from '../types.js';
import { digits, istDate, isRecord, str } from '../util.js';

const MANDATORY = ['pickup_time', 'pickup_date', 'pickup_location', 'expected_package_count'] as const;

function err(status: number, error: string): HandlerResult {
  return { status, body: { success: false, error }, envelope: 'mock-defined' };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function pickupRequest(ctx: Ctx): HandlerResult {
  let body: unknown;
  try {
    body = JSON.parse(ctx.rawBody || '{}');
  } catch (e) {
    return err(400, MOCK_TEXT.invalidJson((e as Error).message));
  }
  if (!isRecord(body)) return err(400, MOCK_TEXT.invalidJson('expected a JSON object'));

  const missing = MANDATORY.filter((k) => str(body[k]) === '');
  if (missing.length) return err(400, MOCK_TEXT.missingFields(missing));

  const date = str(body.pickup_date);
  const time = str(body.pickup_time);
  const location = str(body.pickup_location);
  const count = Number(body.expected_package_count);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return err(400, 'MOCK: pickup_date must be YYYY-MM-DD');
  }
  if (!/^\d{2}:\d{2}:\d{2}$/.test(time)) return err(400, 'MOCK: pickup_time must be hh:mm:ss');
  if (!Number.isInteger(count) || count < 1) return err(400, 'MOCK: expected_package_count must be a positive integer');

  const today = istDate(ctx.now());
  if (date < today) {
    // Documented error form: "pickup_date": "Pickup date cannot be in past"
    return { status: 400, body: { pickup_date: DOC_ERRORS.pickupDatePast }, envelope: 'mock-defined' };
  }
  if (date > addDays(today, 7)) return err(400, DOC_ERRORS.pickupDateTooFar);
  if (ctx.cfg.warehouses && !ctx.cfg.warehouses.includes(location)) return err(200, DOC_ERRORS.pickupInvalidLocation);

  const pickupId = Number(digits(`${location}|${date}|${time}|${count}`, 8));
  switch (ctx.active?.name) {
    case 'low_balance':
      ctx.applied = true;
      return err(200, DOC_ERRORS.insufficientBalance);
    case 'no_rider':
      ctx.applied = true;
      return err(200, MOCK_TEXT.noRiderPickup(location, date));
    case 'pickup_already_exists':
      ctx.applied = true;
      return err(200, DOC_ERRORS.pickupExists(String(pickupId)));
    case 'auto_pickup':
      ctx.applied = true;
      return err(200, DOC_ERRORS.autoPickup);
  }

  ctx.log.info('pickup request created', { pickup_id: pickupId, pickup_date: date });
  return {
    status: 200,
    body: {
      success: true,
      pickup_id: pickupId,
      pickup_location: location,
      pickup_date: date,
      pickup_time: time,
      expected_package_count: count,
      status: 'Scheduled', // documented PUR status for a newly created request (S17)
    },
    envelope: 'mock-defined',
  };
}
