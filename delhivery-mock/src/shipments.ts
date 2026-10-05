// Shipment lookup and tracking-state derivation shared by the tracking and edit handlers.

import {
  DEFAULT_STAGE,
  FORWARD_HAPPY_PATH_LENGTH,
  MOCK_TEXT,
  REVERSE_HAPPY_PATH_LENGTH,
  findStage,
  stagesFor,
  type Journey,
  type PaymentMode,
  type StageDef,
} from './contract.js';
import type { ShipmentRecord } from './store.js';
import type { Ctx } from './types.js';
import { addHours, istIso, istSpaced, journeyFor, paymentModeFromWaybill } from './util.js';

export interface ResolvedShipment {
  waybill: string;
  order: string | null;
  paymentMode: PaymentMode;
  journey: Journey;
  city: string | null;
  createdAt: Date | null;
  record?: ShipmentRecord;
}

/** Store first, then the deterministic mock waybill pattern. null = unknown waybill. */
export function resolveWaybill(ctx: Ctx, waybill: string): ResolvedShipment | null {
  const rec = ctx.store.get(waybill);
  if (rec) {
    return {
      waybill,
      order: rec.order,
      paymentMode: rec.paymentMode,
      journey: rec.journey,
      city: rec.city,
      createdAt: rec.createdAt,
      record: rec,
    };
  }
  const mode = paymentModeFromWaybill(waybill);
  if (!mode) return null;
  return { waybill, order: null, paymentMode: mode, journey: journeyFor(mode), city: null, createdAt: null };
}

export interface StageState {
  stage: StageDef;
  /** Index used to space StatusDateTime values deterministically. */
  index: number;
  syntheticNoRider: boolean;
}

/**
 * Precedence: stage scenario (if it matches the journey) > cancellation recorded in the store >
 * MOCK_PROGRESS_SECONDS auto-advance > default stage (rvp_scheduled / fwd_manifested).
 */
export function currentStage(ctx: Ctx, s: ResolvedShipment): StageState {
  const stages = stagesFor(s.journey);
  const at = (name: string): StageState => {
    const stage = findStage(s.journey, name) ?? findStage(s.journey, DEFAULT_STAGE[s.journey])!;
    return { stage, index: Math.max(0, stages.indexOf(stage)), syntheticNoRider: false };
  };

  const active = ctx.active;
  if (active?.kind === 'stage' && findStage(s.journey, active.name)) {
    ctx.applied = true;
    return at(active.name);
  }
  if (active?.name === 'no_rider_after_manifest' && s.journey === 'reverse') {
    ctx.applied = true;
    return { ...at('rvp_scheduled'), syntheticNoRider: true };
  }
  if (s.record?.stageOverride) return at(s.record.stageOverride);

  const def = at(DEFAULT_STAGE[s.journey]);
  if (ctx.cfg.progressSeconds > 0 && s.createdAt) {
    const steps = Math.floor((ctx.now().getTime() - s.createdAt.getTime()) / 1000 / ctx.cfg.progressSeconds);
    const last = (s.journey === 'reverse' ? REVERSE_HAPPY_PATH_LENGTH : FORWARD_HAPPY_PATH_LENGTH) - 1;
    const idx = Math.min(def.index + Math.max(0, steps), last);
    return { stage: stages[idx]!, index: idx, syntheticNoRider: false };
  }
  return def;
}

/** Documented `Shipment` object keys (contract: Shipment Tracking, S10 webhook payload). Values are mock data. */
export function shipmentObject(ctx: Ctx, s: ResolvedShipment, st: StageState, refFallback: string | null) {
  const base = s.createdAt ?? ctx.now();
  const statusTime = addHours(base, st.index * 2);
  const city = s.city ?? 'Mock';
  return {
    Status: {
      Status: st.stage.status,
      StatusDateTime: istIso(statusTime),
      StatusType: st.stage.statusType,
      StatusLocation: `${city}_Mock_DC (${city})`,
      Instructions: st.syntheticNoRider ? MOCK_TEXT.noRiderTracking : st.stage.instructions,
    },
    PickUpDate: istSpaced(addHours(base, 24)),
    NSLCode: st.syntheticNoRider ? null : st.stage.nsl,
    Sortcode: null,
    ReferenceNo: s.order ?? refFallback,
    AWB: s.waybill,
  };
}
