// Best-effort in-memory state (per server instance).
// Tracking never depends on it for *finding* a mock waybill: waybills are deterministic and self-describing
// (see util.mockWaybill), so a cold serverless instance still answers. The store only adds detail that cannot be
// derived from the waybill (order id, pincode, creation time, cancellations, edits).

import type { Journey, PaymentMode } from './contract.js';

export interface ShipmentRecord {
  waybill: string;
  order: string;
  paymentMode: PaymentMode;
  journey: Journey;
  pin: string;
  city: string | null;
  createdAt: Date;
  /** Stage scenario forced by a cancellation (e.g. rvp_canceled). */
  stageOverride?: string;
  canceledAt?: Date;
  edits: Record<string, unknown>;
}

export class Store {
  private byWaybill = new Map<string, ShipmentRecord>();
  private byOrder = new Map<string, string>();

  put(rec: ShipmentRecord): void {
    this.byWaybill.set(rec.waybill, rec);
    if (rec.order) this.byOrder.set(rec.order, rec.waybill);
  }

  get(waybill: string): ShipmentRecord | undefined {
    return this.byWaybill.get(waybill);
  }

  waybillForOrder(order: string): string | undefined {
    return this.byOrder.get(order);
  }

  clear(): void {
    this.byWaybill.clear();
    this.byOrder.clear();
  }
}
