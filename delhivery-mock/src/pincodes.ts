// Mock pincode dataset.
// Field names and value conventions come from the documented response (contract: Pincode Serviceability, S10 Q2).
// Pin 400064 is reproduced exactly from that documented sample (note: pickup "N" → not serviceable for reverse pickup).
// All other rows are MOCK data invented for demos, not real Delhivery serviceability.

import type { Config } from './config.js';
import type { PaymentMode } from './contract.js';

export interface PostalCode {
  city: string;
  cod: 'Y' | 'N';
  inc: string;
  district: string;
  pin: number;
  max_amount: number;
  pre_paid: 'Y' | 'N';
  cash: 'Y' | 'N';
  state_code: string;
  max_weight: number;
  pickup: 'Y' | 'N';
  repl: 'Y' | 'N';
  covid_zone: null;
  country_code: string;
  is_oda: 'Y' | 'N';
  remarks: string;
}

function row(pin: number, city: string, district: string, inc: string, state_code: string, over: Partial<PostalCode> = {}): PostalCode {
  return {
    city,
    cod: 'Y',
    inc,
    district,
    pin,
    max_amount: 0.0,
    pre_paid: 'Y',
    cash: 'Y',
    state_code,
    max_weight: 0.0,
    pickup: 'Y',
    repl: 'Y',
    covid_zone: null,
    country_code: 'IN',
    is_oda: 'N',
    remarks: '',
    ...over,
  };
}

const DATASET: PostalCode[] = [
  // Documented sample (S10 Q2), verbatim values.
  row(400064, 'Mumbai', 'Mumbai', 'Mumbai MIDC (Maharashtra)', 'MH', { cod: 'N', pickup: 'N' }),
  // Mock rows.
  row(110042, 'Delhi', 'North West Delhi', 'Delhi Mock DC (Delhi)', 'DL'),
  row(122002, 'Gurugram', 'Gurugram', 'Gurugram Mock DC (Haryana)', 'HR'),
  row(122003, 'Gurugram', 'Gurugram', 'Gurugram Mock DC (Haryana)', 'HR'),
  row(560001, 'Bengaluru', 'Bengaluru Urban', 'Bengaluru Mock DC (Karnataka)', 'KA'),
  row(580001, 'Dharwad', 'Dharwad', 'Dharwad Mock DC (Karnataka)', 'KA'),
  row(600063, 'Chennai', 'Chennai', 'Chennai Mock DC (Tamil Nadu)', 'TN'),
  row(394101, 'Surat', 'Surat', 'Surat Mock DC (Gujarat)', 'GJ'),
  // Mock embargo (temporary NSZ): documented meaning of remarks "Embargo".
  row(744101, 'Port Blair', 'South Andaman', 'Port Blair Mock DC (Andaman and Nicobar)', 'AN', {
    remarks: 'Embargo',
  }),
];

const BY_PIN = new Map(DATASET.map((r) => [String(r.pin), r]));

/** Documented: "If filter_code is not passed, the API returns both serviceable and embargoed pincodes." */
export function allPincodes(): PostalCode[] {
  return DATASET;
}

/** Pincodes that always return an empty delivery_codes list (documented NSZ response). */
export const MOCK_NSZ_PINS = new Set(['999999']);

export function isValidPinFormat(pin: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pin);
}

/** Returns the postal_code record, or null when the documented response would be an empty list (NSZ / invalid). */
export function lookupPincode(pinRaw: string | number | undefined | null, cfg: Config): PostalCode | null {
  const pin = String(pinRaw ?? '').trim();
  if (!isValidPinFormat(pin) || MOCK_NSZ_PINS.has(pin)) return null;
  const known = BY_PIN.get(pin);
  if (known) return known;
  if (cfg.unknownPincodes === 'nsz') return null;
  return row(Number(pin), 'Mock City', 'Mock District', `Mock DC ${pin}`, 'NA');
}

/** True when the pincode is serviceable for the given payment mode (documented flag semantics, S10 Q2). */
export function serviceableFor(pc: PostalCode | null, mode: PaymentMode): boolean {
  if (!pc || pc.remarks === 'Embargo') return false;
  switch (mode) {
    case 'Pickup':
      return pc.pickup === 'Y';
    case 'Prepaid':
      return pc.pre_paid === 'Y';
    case 'COD':
      return pc.cod === 'Y';
    case 'REPL':
      return pc.repl === 'Y';
  }
}
