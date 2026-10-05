import { createHash } from 'node:crypto';
import type { Journey, PaymentMode } from './contract.js';
import { PAYMENT_MODES } from './contract.js';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Deterministic n-digit decimal string derived from the input. */
export function digits(input: string, n: number): string {
  const v = BigInt('0x' + sha256(input).slice(0, 24)) % 10n ** BigInt(n);
  return v.toString().padStart(n, '0');
}

const JOURNEY_DIGIT: Record<PaymentMode, string> = { Prepaid: '1', COD: '1', Pickup: '2', REPL: '3' };

/**
 * MOCK waybill numbering: 13 digits = "9" + journey digit (1 forward, 2 reverse pickup, 3 replacement)
 * + 11 digits of sha256(order|payment_mode). The real Delhivery waybill series is account-specific and not public.
 */
export function mockWaybill(order: string, mode: PaymentMode): string {
  return '9' + JOURNEY_DIGIT[mode] + digits(`${order}|${mode}`, 11);
}

export const MOCK_WAYBILL_PATTERN = /^9[123]\d{11}$/;

export function paymentModeFromWaybill(waybill: string): PaymentMode | null {
  if (!MOCK_WAYBILL_PATTERN.test(waybill)) return null;
  return waybill[1] === '2' ? 'Pickup' : waybill[1] === '3' ? 'REPL' : 'Prepaid';
}

export function journeyFor(mode: PaymentMode): Journey {
  return mode === 'Pickup' ? 'reverse' : 'forward';
}

/** Case-insensitive match against the documented payment_mode values. */
export function normalizePaymentMode(raw: unknown): PaymentMode | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase().replace(/[-\s]/g, '');
  if (v === 'prepaid') return 'Prepaid';
  return PAYMENT_MODES.find((m) => m.toLowerCase() === v) ?? null;
}

/** Deterministic UUID-shaped id. */
export function mockUuid(input: string): string {
  const h = sha256(input);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** India local time as `YYYY-MM-DDTHH:mm:ss.SSS` (documented StatusDateTime style, no zone suffix). */
export function istIso(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 23);
}

/** India local date `YYYY-MM-DD`. */
export function istDate(d: Date): string {
  return istIso(d).slice(0, 10);
}

/** `YYYY-MM-DD HH:mm:ss.SSS` (documented PickUpDate style). */
export function istSpaced(d: Date): string {
  return istIso(d).replace('T', ' ');
}

export function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3_600_000);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function str(v: unknown): string {
  if (v === undefined || v === null) return '';
  return typeof v === 'string' ? v.trim() : String(v).trim();
}
