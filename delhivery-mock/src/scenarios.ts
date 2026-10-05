// Scenario registry and resolution.
//
// Every scenario is classified honestly:
//   documented  — reproduces an error/response that official Delhivery documentation describes
//                 (see docs/delhivery-api-contract.md for the exact source)
//   synthetic   — a competition-only failure required by the brief; NOT a documented Delhivery behaviour
//   stage       — selects a documented tracking status (Package Lifecycle) for the tracking endpoint
//   normal      — default happy path

export type EndpointId = 'pincode' | 'manifest' | 'pickup_request' | 'tracking' | 'edit' | 'validate';
export type ScenarioKind = 'normal' | 'documented' | 'synthetic' | 'stage';

export interface ScenarioDef {
  name: string;
  kind: ScenarioKind;
  appliesTo: EndpointId[] | 'all';
  description: string;
  /** Official source for documented scenarios (contract section / source id). */
  source?: string;
}

export const SCENARIOS: ScenarioDef[] = [
  { name: 'normal', kind: 'normal', appliesTo: 'all', description: 'Default successful behaviour.' },

  // Competition-only synthetic failures (brief: "no rider, low balance, timeout and malformed reply").
  {
    name: 'no_rider',
    kind: 'synthetic',
    appliesTo: ['manifest', 'pickup_request'],
    description:
      'Reverse-pickup manifest (payment_mode Pickup) and pickup-request creation fail: no field executive available. ' +
      'Delhivery does not document such an API error.',
  },
  {
    name: 'no_rider_after_manifest',
    kind: 'synthetic',
    appliesTo: ['tracking'],
    description:
      'Manifest succeeds normally, but tracking shows the reverse pickup still "Scheduled" with a failed pickup ' +
      'attempt (no field executive). Tests that "created" is not "picked up".',
  },
  {
    name: 'timeout',
    kind: 'synthetic',
    appliesTo: 'all',
    description:
      'Request is processed, then the response is held for MOCK_TIMEOUT_MS and returned as 504. Clients with a ' +
      'shorter timeout see a timeout; the operation may nevertheless have taken effect.',
  },
  {
    name: 'malformed',
    kind: 'synthetic',
    appliesTo: 'all',
    description: 'HTTP 200 with Content-Type application/json but a truncated, unparseable body.',
  },
  {
    name: 'malformed_fields',
    kind: 'synthetic',
    appliesTo: 'all',
    description: 'HTTP 200 with valid JSON whose key fields are missing or have the wrong type.',
  },

  // Documented Delhivery errors.
  {
    name: 'low_balance',
    kind: 'documented',
    appliesTo: ['manifest', 'pickup_request'],
    description: "Insufficient wallet balance ('client manifest charge API failed due to insufficient balance').",
    source: 'Contract: LOW BALANCE (S10 FAQ, Common Remarks)',
  },
  {
    name: 'nsz',
    kind: 'documented',
    appliesTo: ['pincode', 'manifest'],
    description: 'Force non-serviceable pincode: empty delivery_codes / "<pin> is non serviceable pincode".',
    source: 'Contract: Pincode Serviceability; Shipment Creation (S2, S10)',
  },
  {
    name: 'duplicate_order',
    kind: 'documented',
    appliesTo: ['manifest'],
    description: 'Manifest fails with "Duplicate Order Id".',
    source: 'Contract: Shipment Creation (S10 Common Remarks)',
  },
  {
    name: 'warehouse_inactive',
    kind: 'documented',
    appliesTo: ['manifest'],
    description: 'Manifest fails with rmk "Client-Warehouse is not active."',
    source: 'Contract: Shipment Creation (S10 Common Remarks)',
  },
  {
    name: 'pickup_already_exists',
    kind: 'documented',
    appliesTo: ['pickup_request'],
    description: 'Pickup request fails: an open pickup request already exists for the location.',
    source: 'Contract: Pickup Request Creation (S10 Common Remarks)',
  },
  {
    name: 'auto_pickup',
    kind: 'documented',
    appliesTo: ['pickup_request'],
    description: 'Pickup request fails: client is on auto pickup.',
    source: 'Contract: Pickup Request Creation (S10 Common Remarks)',
  },
  {
    name: 'unknown_waybill',
    kind: 'documented',
    appliesTo: ['tracking', 'edit'],
    description: 'Tracking returns "Data does not exists for provided Waybill(s)".',
    source: 'Contract: Shipment Tracking (S10 Track Common Remarks)',
  },
  {
    name: 'rate_limited',
    kind: 'documented',
    appliesTo: ['tracking'],
    description: 'Tracking returns HTTP 403 Forbidden (rate limit / AWS WAF).',
    source: 'Contract: Shipment Tracking (S10 Track Common Remarks)',
  },
  {
    name: 'bad_address',
    kind: 'documented',
    appliesTo: ['validate'],
    description: 'Address Validation returns quality "not_ok", reason "invalid_or_junk" (documented enum values).',
    source: 'Contract: Address Validation (S14)',
  },

  // Documented tracking stages (Package Lifecycle, S9). Reverse pickup (payment_mode Pickup):
  stage('rvp_open', 'PP Open'),
  stage('rvp_scheduled', 'PP Scheduled (default for a new reverse pickup)'),
  stage('rvp_fe_dispatched', 'PP Dispatched — field executive out to collect'),
  stage('rvp_in_transit', 'PU In Transit — picked up, moving to facility'),
  stage('rvp_pending', 'PU Pending — at origin DC'),
  stage('rvp_out_to_client', 'PU Dispatched — out for delivery to client warehouse'),
  stage('rvp_dto', 'DL DTO — delivered back to client (terminal)'),
  stage('rvp_canceled', 'CN Canceled'),
  stage('rvp_closed', 'CN Closed'),
  // Forward (COD / Prepaid / REPL forward leg):
  stage('fwd_manifested', 'UD Manifested (default for a new forward shipment)'),
  stage('fwd_not_picked', 'UD Not Picked'),
  stage('fwd_in_transit', 'UD In Transit'),
  stage('fwd_pending', 'UD Pending'),
  stage('fwd_dispatched', 'UD Dispatched'),
  stage('fwd_delivered', 'DL Delivered (terminal)'),
  stage('fwd_rt_in_transit', 'RT In Transit (converted to return)'),
  stage('fwd_rto', 'DL RTO (returned to origin, terminal)'),
];

function stage(name: string, description: string): ScenarioDef {
  return {
    name,
    kind: 'stage',
    appliesTo: ['tracking', 'edit'],
    description,
    source: 'Contract: Shipment Tracking status table (S9 Package Lifecycle)',
  };
}

const BY_NAME = new Map(SCENARIOS.map((s) => [s.name, s]));

export function getScenario(name: string): ScenarioDef | undefined {
  return BY_NAME.get(name);
}

export function appliesTo(def: ScenarioDef, endpoint: EndpointId): boolean {
  return def.appliesTo === 'all' || def.appliesTo.includes(endpoint);
}

export type ScenarioSource = 'header' | 'path' | 'env' | 'default';

export interface ResolvedScenario {
  def: ScenarioDef;
  source: ScenarioSource;
  /** Request path with any `/scenario/<name>` prefix removed. */
  path: string;
}

export class UnknownScenarioError extends Error {
  constructor(readonly scenario: string) {
    super(`Unknown mock scenario "${scenario}"`);
  }
}

const PATH_PREFIX = /^\/scenario\/([A-Za-z0-9_-]+)(\/.*)?$/;

/**
 * Precedence: X-Mock-Scenario header > `/scenario/<name>/...` path prefix > MOCK_SCENARIO env > "normal".
 * The path prefix lets a whole AgenticOrg custom connector be pointed at one scenario by its base URL,
 * without adding any undocumented request field.
 */
export function resolveScenario(
  path: string,
  headerValue: string | undefined,
  envDefault: string,
): ResolvedScenario {
  let rest = path;
  let fromPath: string | undefined;
  const m = PATH_PREFIX.exec(path);
  if (m) {
    fromPath = m[1];
    rest = m[2] || '/';
  }
  const header = headerValue?.trim();
  const [name, source]: [string, ScenarioSource] = header
    ? [header, 'header']
    : fromPath
      ? [fromPath, 'path']
      : envDefault && envDefault !== 'normal'
        ? [envDefault, 'env']
        : ['normal', 'default'];
  const def = getScenario(name.toLowerCase());
  if (!def) throw new UnknownScenarioError(name);
  return { def, source, path: rest };
}
