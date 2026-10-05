// Everything that encodes the Delhivery contract lives here, split into
//   DOC  — text/values copied from official Delhivery documentation (source ids refer to
//          docs/delhivery-api-contract.md)
//   MOCK — shapes the public documentation does not specify. Swap these once verified against
//          authenticated Delhivery docs (Execute API in Delhivery One).

/* ------------------------------------------------------------------ DOC: error strings */

export const DOC_ERRORS = {
  // S10 Common Remarks / Q8–Q11 (manifestation)
  authMissing: 'Authentication credentials were not provided',
  authWrongToken: 'Login or API Key Required', // S10 pincode remarks
  formatKeyMissing: 'format key missing in the post',
  shipmentsNotList: "Error message is 'unicode' object has no attribute 'get'.",
  wrongClient: 'shipment list contains no data',
  warehouseMissing: 'ClientWarehouse matching query does not exist.',
  warehouseInactive: 'Client-Warehouse is not active.',
  duplicateOrder: 'Duplicate Order Id',
  insufficientBalance:
    "Crashing while saving package due to exception 'client manifest charge API failed due to insufficient balance'. Package might have been partially saved.",
  nonServiceablePin: (pin: string) =>
    `Crashing while saving package due to exception '${pin} is non serviceable pincode'. Package might have been partially saved.`,
  packageTypeNotServiceable: (mode: string) =>
    `Crashing while saving package due to exception 'Package type ${mode} not serviceable for this account "Package might have been partially saved.`,
  incorrectPhone: (order: string) => `Incorrect phone number(s) for order ${order}`,
  orderIdTooLong: 'oid does not pass the validator <lambda>.check if there any extra character or dots in column',

  // S10 Pickup Request Common Remarks
  pickupExists: (id: string) => `A Pickup Request ${id} for this Pickup Location Already Exist.`,
  pickupDatePast: 'Pickup date cannot be in past',
  pickupDateTooFar: 'Pickup date should not be more than 7 days from pickup creation date',
  pickupInvalidLocation: 'Invalid Pickup Location ClientWarehouse matching query does not exist.',
  autoPickup: 'Client is on auto pickup and please raise a ticket to firstmile_servicing@delhivery.com',

  // S10 Track Common Remarks
  trackNoData: 'Data does not exists for provided Waybill(s)',
  trackNotFound: 'No such waybill or order ID found',
  forbidden: '403 Forbidden',
} as const;

/* ------------------------------------------------------------------ DOC: lifecycle (S9, S12) */

export type Journey = 'reverse' | 'forward';

export interface StageDef {
  scenario: string; // stage scenario name in src/scenarios.ts
  statusType: string;
  status: string;
  /** Mock-defined human text placed in Status.Instructions (real NSL remarks are not public). */
  instructions: string;
  /** NSL code; only codes whose meaning is documented are used, otherwise null. */
  nsl: string | null;
}

// Order matters: used for MOCK_PROGRESS_SECONDS auto-advance (until the first terminal stage).
export const REVERSE_STAGES: StageDef[] = [
  { scenario: 'rvp_open', statusType: 'PP', status: 'Open', instructions: 'Reverse pickup request created', nsl: null },
  { scenario: 'rvp_scheduled', statusType: 'PP', status: 'Scheduled', instructions: 'Pickup scheduled', nsl: null },
  { scenario: 'rvp_fe_dispatched', statusType: 'PP', status: 'Dispatched', instructions: 'Field executive out for pickup', nsl: null },
  { scenario: 'rvp_in_transit', statusType: 'PU', status: 'In Transit', instructions: 'Picked up from customer; in transit', nsl: null },
  { scenario: 'rvp_pending', statusType: 'PU', status: 'Pending', instructions: 'Reached origin DC', nsl: null },
  { scenario: 'rvp_out_to_client', statusType: 'PU', status: 'Dispatched', instructions: 'Dispatched to client warehouse', nsl: null },
  { scenario: 'rvp_dto', statusType: 'DL', status: 'DTO', instructions: 'Delivered to origin (client warehouse)', nsl: null },
  // Off the happy path:
  { scenario: 'rvp_canceled', statusType: 'CN', status: 'Canceled', instructions: 'Pickup request canceled', nsl: 'EOD-21' },
  { scenario: 'rvp_closed', statusType: 'CN', status: 'Closed', instructions: 'Reverse pickup request closed', nsl: null },
];
export const REVERSE_HAPPY_PATH_LENGTH = 7;

export const FORWARD_STAGES: StageDef[] = [
  { scenario: 'fwd_manifested', statusType: 'UD', status: 'Manifested', instructions: 'Manifest uploaded', nsl: 'X-UCI' },
  { scenario: 'fwd_in_transit', statusType: 'UD', status: 'In Transit', instructions: 'Shipment in transit', nsl: null },
  { scenario: 'fwd_pending', statusType: 'UD', status: 'Pending', instructions: 'Reached destination DC', nsl: null },
  { scenario: 'fwd_dispatched', statusType: 'UD', status: 'Dispatched', instructions: 'Out for delivery', nsl: null },
  { scenario: 'fwd_delivered', statusType: 'DL', status: 'Delivered', instructions: 'Delivered to consignee', nsl: null },
  // Off the happy path:
  { scenario: 'fwd_not_picked', statusType: 'UD', status: 'Not Picked', instructions: 'Shipment not picked up from warehouse', nsl: null },
  { scenario: 'fwd_rt_in_transit', statusType: 'RT', status: 'In Transit', instructions: 'Converted to return; in transit to origin', nsl: null },
  { scenario: 'fwd_rto', statusType: 'DL', status: 'RTO', instructions: 'Returned to origin', nsl: null },
];
export const FORWARD_HAPPY_PATH_LENGTH = 5;

export const DEFAULT_STAGE: Record<Journey, string> = { reverse: 'rvp_scheduled', forward: 'fwd_manifested' };

export function stagesFor(journey: Journey): StageDef[] {
  return journey === 'reverse' ? REVERSE_STAGES : FORWARD_STAGES;
}

export function findStage(journey: Journey, scenario: string): StageDef | undefined {
  return stagesFor(journey).find((s) => s.scenario === scenario);
}

/** S5 / S4: statuses in which cancellation / edit are allowed. */
export const EDITABLE_STATUSES: Record<Journey, string[]> = {
  reverse: ['Scheduled'],
  forward: ['Manifested', 'In Transit', 'Pending'],
};

/** S3 payment_mode values. */
export const PAYMENT_MODES = ['Pickup', 'COD', 'Prepaid', 'REPL'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** S4 updatable fields. */
export const EDITABLE_FIELDS = [
  'name',
  'phone',
  'pt',
  'add',
  'products_desc',
  'gm',
  'shipment_height',
  'shipment_width',
  'shipment_length',
  'cod',
] as const;

/* ------------------------------------------------------------------ MOCK: envelopes */

export interface ManifestResult {
  order: string | null;
  waybill: string | null;
  payment_mode: string | null;
  status: 'Success' | 'Fail';
  remarks: string;
}

/** MOCK-defined manifest envelope. `rmk` is the documented error key (S10). */
export function manifestEnvelope(results: ManifestResult[], rmk = '') {
  return {
    success: results.length > 0 && results.every((r) => r.status === 'Success'),
    rmk,
    shipments: results,
  };
}

/** MOCK-defined list envelope around documented `Shipment` objects (S10 webhook payload keys). */
export function trackingEnvelope(shipments: unknown[]) {
  return { shipments: shipments.map((s) => ({ Shipment: s })) };
}

export const MOCK_TEXT = {
  noRiderManifest: (pin: string) =>
    `MOCK SYNTHETIC FAILURE (not a documented Delhivery error): no field executive available to schedule the reverse pickup at pincode ${pin} for the requested window. The shipment was not created; retry later.`,
  noRiderPickup: (location: string, date: string) =>
    `MOCK SYNTHETIC FAILURE (not a documented Delhivery error): no field executive available for pickup location "${location}" on ${date}. Pickup request not created; retry later.`,
  noRiderTracking:
    'MOCK SYNTHETIC: pickup attempt failed - no field executive available; shipment not picked up',
  timeout: 'MOCK SYNTHETIC: simulated upstream timeout',
  missingFields: (fields: string[]) => `MOCK: missing mandatory field(s): ${fields.join(', ')}`,
  emptyShipments: 'MOCK: shipments list is empty',
  invalidJson: (detail: string) => `MOCK: request body is not valid JSON (${detail})`,
  waybillNotFound: 'MOCK: waybill not found for this account',
  editNotAllowed: (status: string, journey: Journey) =>
    `MOCK: edit/cancel not allowed in status "${status}" (documented: ${journey === 'reverse' ? 'reverse pickups only in Scheduled' : 'forward only in Manifested, In Transit, Pending'})`,
  paymentConversionNotAllowed: (from: string, to: string) =>
    `MOCK: payment mode conversion ${from} -> ${to} is not allowed (documented rule, Shipment Updation)`,
} as const;
