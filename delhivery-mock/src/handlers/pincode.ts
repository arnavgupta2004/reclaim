// GET /c/api/pin-codes/json/?filter_codes=<pin>  — contract: Pincode Serviceability (S2, S10)

import { allPincodes, lookupPincode } from '../pincodes.js';
import type { Ctx, HandlerResult } from '../types.js';

export function pincode(ctx: Ctx): HandlerResult {
  if (ctx.active?.name === 'nsz') {
    ctx.applied = true;
    return { status: 200, body: { delivery_codes: [] }, envelope: 'documented' };
  }
  const filter = ctx.query.get('filter_codes');
  if (filter === null || filter.trim() === '') {
    return {
      status: 200,
      body: { delivery_codes: allPincodes().map((pc) => ({ postal_code: pc })) },
      envelope: 'documented',
    };
  }
  const pc = lookupPincode(filter, ctx.cfg);
  return { status: 200, body: { delivery_codes: pc ? [{ postal_code: pc }] : [] }, envelope: 'documented' };
}
