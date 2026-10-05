// POST /validate  — contract: Address Validation (Delhivery Maps, S14). Field names and enums are documented;
// the validation verdicts below come from simple deterministic MOCK heuristics, not Delhivery's model.

import { lookupPincode } from '../pincodes.js';
import type { Ctx, HandlerResult } from '../types.js';
import { isRecord, mockUuid, str } from '../util.js';

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      /^\d+(st|nd|rd|th)$/i.test(w)
        ? w.toLowerCase()
        : /\d/.test(w)
          ? w.toUpperCase()
          : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(' ');
}

function tidy(address: string): string {
  return address
    .split(',')
    .map((part) => titleCase(part.trim()))
    .filter(Boolean)
    .join(', ');
}

export function validate(ctx: Ctx): HandlerResult {
  let body: unknown;
  try {
    body = JSON.parse(ctx.rawBody || '{}');
  } catch (e) {
    return { status: 400, body: { error: `MOCK: request body is not valid JSON (${(e as Error).message})` }, envelope: 'mock-defined' };
  }
  if (!isRecord(body) || str(body.address) === '') {
    return { status: 400, body: { error: 'MOCK: address is required' }, envelope: 'mock-defined' };
  }
  const address = str(body.address);
  const reqId = body.req_id === undefined || body.req_id === null ? undefined : str(body.req_id);

  const verdict = (
    quality: 'ok' | 'not_ok',
    granularity_level: string,
    reason: 'valid' | 'incomplete' | 'correction_needed' | 'invalid_or_junk',
    formatted: string,
  ): HandlerResult => ({
    status: 200,
    body: {
      quality,
      granularity_level,
      reason,
      formatted_address: reason === 'invalid_or_junk' ? '' : formatted,
      corrections: reason === 'invalid_or_junk' || formatted === address ? address : `<${address}|${formatted}>`,
      request_id: mockUuid(`validate|${address}`),
      ...(reqId !== undefined ? { req_id: reqId } : {}),
    },
    envelope: 'documented',
  });

  if (ctx.active?.name === 'bad_address') {
    ctx.applied = true;
    return verdict('not_ok', 'NONE', 'invalid_or_junk', '');
  }
  const letters = (address.match(/[a-z]/gi) ?? []).length;
  if (address.length < 10 || letters < 4) return verdict('not_ok', 'NONE', 'invalid_or_junk', '');

  const pinMatch = /\b([1-9]\d{5})\b/.exec(address);
  if (!pinMatch) return verdict('not_ok', 'LOCALITY', 'incomplete', tidy(address));
  const pin = pinMatch[1]!;
  const withoutPin = address.replace(pin, '').replace(/[\s,]+$/, '');
  const pc = lookupPincode(pin, ctx.cfg);
  const hasCity = pc ? withoutPin.toLowerCase().includes(pc.city.toLowerCase()) : true;
  const formatted = `${tidy(withoutPin)}${pc && !hasCity ? `, ${pc.city}` : ''}, ${pin}`;
  if (!pc) return verdict('not_ok', 'LOCALITY', 'correction_needed', formatted);
  const hasPremise = /\d/.test(withoutPin);
  if (!hasPremise) return verdict('not_ok', 'SUBLOCALITY_VILLAGE', 'incomplete', formatted);
  return verdict('ok', 'PREMISE', 'valid', formatted);
}
