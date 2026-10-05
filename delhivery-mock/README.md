# reclaim-delhivery-mock

A deployable mock of the **Delhivery B2C APIs** (plus Delhivery Maps **address validation**) for **Reclaim**, the
autonomous financial-recovery agent built on Pine Labs AgenticOrg (The Ken Case Competition 2026, Round 3:
"The Great Rewiring").

It gives Reclaim a realistic external logistics world that **can fail**: no rider, low wallet balance, timeouts,
malformed replies, unserviceable pincodes and bad addresses. Judges can watch Reclaim refuse to trust a tool blindly.

> Not affiliated with Delhivery. Endpoint paths, request fields, error strings and status values come from
> Delhivery's public documentation. Every source is cited in **[`docs/delhivery-api-contract.md`](docs/delhivery-api-contract.md)**.
> The official files were archived locally with checksums in `docs/sources/SHA256SUMS.txt`; they are not
> redistributed here, and [`docs/sources/README.md`](docs/sources/README.md) explains how to re-fetch and verify them. Where Delhivery has not
> published something (mostly success-response envelopes), the mock's shape is labelled **mock-defined**.

---

## Contents

- [What is real vs. synthetic](#what-is-real-vs-synthetic)
- [Endpoints](#endpoints)
- [Switching scenarios](#switching-scenarios) (success, no rider, timeout, malformed, invalid address/pincode)
- [Run locally](#run-locally)
- [Tests](#tests)
- [Deploy to Vercel](#deploy-to-vercel)
- [Environment variables](#environment-variables)
- [Register in AgenticOrg](#register-in-agenticorg-custom-connector)
- [Demo script for judges](#demo-script-for-judges)
- [Example requests and responses](#example-requests-and-responses)
- [Design notes and limitations](#design-notes-and-limitations)

---

## What is real vs. synthetic

| Scenario | Classification | Basis |
|---|---|---|
| `normal` | default | Documented paths and request fields |
| `low_balance` | **Documented Delhivery error** | FAQ: "Crashing while saving package due to exception 'client manifest charge API failed due to insufficient balance'. Package might have been partially saved." (manifest **and** pickup request) |
| `nsz` / pin `999999` / pin `400064` for reverse pickup | **Documented** | Empty `delivery_codes` = NSZ; "`<pin>` is non serviceable pincode" |
| `duplicate_order`, `warehouse_inactive`, `pickup_already_exists`, `auto_pickup`, `unknown_waybill`, `rate_limited` | **Documented** | FAQ "Common Remarks" error tables |
| `bad_address` | **Documented response values** | Maps `/validate`: `quality: not_ok`, `reason: invalid_or_junk` |
| `rvp_*`, `fwd_*` tracking stages | **Documented status values** | Package Lifecycle (PP/PU/DL/CN, UD/RT/DL) |
| `no_rider`, `no_rider_after_manifest` | **Competition-only SYNTHETIC** | Delhivery documents **no** "no rider" API error; the brief requires one |
| `timeout` | **Competition-only SYNTHETIC** | Required by the brief |
| `malformed`, `malformed_fields` | **Competition-only SYNTHETIC** | Required by the brief |

Synthetic failures say so **in the message text itself** (`MOCK SYNTHETIC FAILURE (not a documented Delhivery
error): ...`) and in the `_mock` metadata object, so the mock never passes off a synthetic failure as a real Delhivery
error. The `malformed*` scenarios deliberately leave `_mock` out of the body. Every response carries the
`X-Mock-Scenario` and `X-Mock-Scenario-Applied` headers.

---

## Endpoints

| Method | Path (as documented) | Delhivery operation | Notes |
|---|---|---|---|
| GET | `/c/api/pin-codes/json/?filter_codes=<pin>` | B2C Pincode Serviceability | Documented response shape |
| POST | `/api/cmu/create.json` | B2C Shipment Manifestation (forward, **reverse pickup** `payment_mode: "Pickup"`, REPL) | Body `format=json&data=<json>` |
| POST | `/fm/request/new/` | B2C Pickup Request Creation | Delhivery documents it is **not needed for reverse pickups** |
| GET | `/api/v1/packages/json/?waybill=<wb>[,<wb>...]&ref_ids=<order>` | B2C Shipment Tracking | Documented `Shipment` keys, mock-defined list wrapper |
| POST | `/api/p/edit` | B2C Shipment Updation and Cancellation (`"cancellation": "true"`) | Documented status gates |
| POST | `/validate` | Delhivery **Maps** Address Validation | Documented request/response schema |
| GET | `/health` | mock-only | No auth |
| GET | `/` | mock-only: service info, scenario list | No auth |
| GET | `/openapi.json` | mock-only: OpenAPI 3 description for tool registration | No auth |

Not implemented (documented, but not needed by Reclaim): waybill pre-fetch, heavy-pincode serviceability, TAT,
shipping cost, label, warehouse create/update, NDR, e-waybill, document download.

Trailing slashes are optional. Any path can be prefixed with `/scenario/<name>` (see below).

---

## Switching scenarios

Precedence: **header > path prefix > env var > `normal`**.

| Mechanism | Example | Best for |
|---|---|---|
| Header | `X-Mock-Scenario: no_rider` | curl, tests, connectors that allow custom headers |
| Base-URL path prefix | `https://<host>/scenario/no_rider` + documented path | **AgenticOrg**: change only the connector's base URL; request fields stay exactly as documented |
| Env var (server default) | `MOCK_SCENARIO=no_rider` then redeploy | a whole deployment stuck in one mode |

The five you asked for:

| Want | Scenario | What Reclaim sees |
|---|---|---|
| **Success** | *(none)* / `normal` | `success: true`, generated waybill; tracking shows `PP Scheduled` |
| **No rider** | `no_rider` | Manifest (Pickup) and pickup request: HTTP 200, `success: false`, `MOCK SYNTHETIC FAILURE ... no field executive available ... retry later` |
| | `no_rider_after_manifest` | Manifest succeeds, but tracking stays `PP Scheduled` with "pickup attempt failed - no field executive available" |
| **Timeout** | `timeout` | Request is processed, then the response is held `MOCK_TIMEOUT_MS` (default 15 s) and returned as `504`. A client with a 10 s timeout gives up first. **The shipment may still exist**, so track by `ref_ids` before retrying |
| **Malformed** | `malformed` | HTTP 200, `application/json`, truncated, unparseable body |
| | `malformed_fields` | HTTP 200, valid JSON, but `waybill`/`status` missing and `success` is the string `"true"` |
| **Invalid address / pincode** | data-driven: pin `999999` (invalid), `744101` (Embargo), `400064` (documented sample, `pickup: "N"`) | Pincode API `delivery_codes: []` / `remarks: "Embargo"`; manifest `'<pin> is non serviceable pincode'` |
| | `nsz` | Forces non-serviceable for any pin |
| | `/validate` with a junk/incomplete address, or `bad_address` | `quality: "not_ok"`, `reason: "invalid_or_junk"` / `"incomplete"` |

Other scenarios: `low_balance`, `duplicate_order`, `warehouse_inactive`, `pickup_already_exists`, `auto_pickup`,
`unknown_waybill`, `rate_limited`. Tracking stages: `rvp_open`, `rvp_scheduled`, `rvp_fe_dispatched`,
`rvp_in_transit`, `rvp_pending`, `rvp_out_to_client`, `rvp_dto`, `rvp_canceled`, `rvp_closed`, `fwd_manifested`,
`fwd_not_picked`, `fwd_in_transit`, `fwd_pending`, `fwd_dispatched`, `fwd_delivered`, `fwd_rt_in_transit`, `fwd_rto`.
`GET /` lists them all. An unknown scenario name returns 400 with the valid list, so a typo can't fall back to the
happy path.

---

## Run locally

Requires Node.js ≥ 20 (tested on 24.7).

```bash
git clone https://github.com/arnavgupta2004/reclaim.git
cd reclaim/delhivery-mock
npm install
MOCK_API_TOKEN=local-demo-token npm start        # http://localhost:3000
```

Exercise every scenario against the running server (in another terminal):

```bash
BASE_URL=http://localhost:3000 MOCK_API_TOKEN=local-demo-token CLIENT_TIMEOUT_MS=3000 npm run exercise
```

The same script works against the deployed URL (`BASE_URL=https://<your-app>.vercel.app`).

## Tests

```bash
npm test          # 67 tests, Node's built-in test runner
npm run typecheck
```

Coverage: successful pickup; no rider (manifest, pickup request, post-manifest tracking; header/path/env selection);
timeout (in-process delay plus a real HTTP client that times out, then finds the shipment by order id);
malformed and malformed_fields; invalid/unserviceable pincode and address; successful tracking (documented keys,
full reverse lifecycle, cold-start statelessness, time progression); unknown waybill/order; low balance (manifest
and pickup request); pickup request success and documented date/location errors; edit/cancel status gates; auth;
routing; OpenAPI; determinism (same input on a fresh instance → identical body).

---

## Deploy to Vercel

Vercel CLI is installed on this machine (`vercel --version` → 59.3.0). From the project folder:

```bash
vercel login
```

```bash
vercel link
```

```bash
vercel env add MOCK_API_TOKEN production
```

(paste a value from `openssl rand -hex 24`; add any other variables from `.env.example` the same way)

```bash
vercel deploy --prod
```

`vercel.json` sends every path to the single function `api/index.ts` (`maxDuration: 60`), so `/api/cmu/create.json`,
`/c/api/...` and `/fm/...` all reach the router.

**Keep `"framework": null` in `vercel.json`.** Vercel auto-assigns the **"Node"** framework preset to this project.
That preset scans for a server entry file, picks `src/app.ts`, and expects its default export to be a handler. Every
request then crashed with `FUNCTION_INVOCATION_FAILED` ("Invalid export found in module /var/task/src/app.mjs").
`"framework": null` forces the classic `api/` functions build.

After deploying, check it:

```bash
curl https://<your-app>.vercel.app/health
```

```bash
BASE_URL=https://<your-app>.vercel.app MOCK_API_TOKEN=<token> npm run exercise
```

If the deployment has **Vercel Deployment Protection** (Vercel Authentication) on, AgenticOrg will get a Vercel login
page instead of JSON. Turn it off for this project under Settings → Deployment Protection, or use the production
domain if protection only covers preview deployments.

---

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `MOCK_API_TOKEN` | *(unset → auth off)* | Required token: `Authorization: Token <value>` (documented B2C scheme). `/validate` also accepts `Bearer` |
| `MOCK_ACCEPT_ALT_AUTH` | `false` | Also accept `Authorization: Bearer <t>` and `X-API-Key: <t>` everywhere (if the connector can't send `Token ...`) |
| `MOCK_SCENARIO` | `normal` | Server-wide default scenario |
| `MOCK_TIMEOUT_MS` | `15000` (max 55000) | Delay for `timeout` |
| `MOCK_INCLUDE_META` | `true` | Include the `_mock` object in bodies |
| `MOCK_STRICT_FORMAT` | `false` | Require the documented `format=json&data=` wrapper on manifest (otherwise plain JSON is accepted, with a `_mock.warnings` entry) |
| `MOCK_WAREHOUSE_NAMES` | *(any)* | Comma-separated registered `pickup_location` names |
| `MOCK_CLIENT_NAME` | *(unchecked)* | Registered client name for the optional `client` field |
| `MOCK_UNKNOWN_PINCODES` | `serviceable` | Pincodes outside the mock dataset: `serviceable` or `nsz` |
| `MOCK_PROGRESS_SECONDS` | `0` | Auto-advance tracking stages every N seconds after creation (live WAIT → CLOSE demos) |
| `MOCK_FIXED_NOW` | *(real clock)* | Fixed clock (ISO-8601) for fully deterministic timestamps |
| `MOCK_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `silent` |
| `PORT` | `3000` | Local server only |

Logs are one JSON line per request (`request_id`, method, path, endpoint, scenario, scenario source, status,
duration). Authorization headers, tokens and request bodies are never logged or echoed back.

---

## Register in AgenticOrg (custom connector)

I could not see AgenticOrg's custom-connector form, so the field names below may not match its UI exactly. Map them
onto whatever the form asks for. From the Pine Labs walkthrough: custom connectors take a **base URL + API
authentication**; connectors show **Auth Type, Base URL, rate limit, timeout (ms)**; **Test Connection / Health
Check** call the API.

| Setting | Value |
|---|---|
| Name | `delhivery_mock` (or "Delhivery (mock)") |
| Base URL | `https://<your-app>.vercel.app` (scenario runs: `https://<your-app>.vercel.app/scenario/<name>`) |
| Auth type | API key, in header `Authorization` with value `Token <MOCK_API_TOKEN>`. If the form can only send a bare key or Bearer, set `MOCK_ACCEPT_ALT_AUTH=true` on Vercel and redeploy |
| Timeout (ms) | `10000` (anything below `MOCK_TIMEOUT_MS` makes the `timeout` scenario trip) |
| Rate limit | any; the mock does not rate-limit (use `rate_limited` to simulate a 403) |
| Health check | `GET /health`, or `GET /` (both 200, no auth) |
| OpenAPI (if import is supported) | `https://<your-app>.vercel.app/openapi.json` |

Tools to register (one per endpoint; the `operationId` values in `/openapi.json`):

| Tool | Method | Path | Inputs |
|---|---|---|---|
| `delhivery_pincode_serviceability` | GET | `/c/api/pin-codes/json/` | query `filter_codes` |
| `delhivery_create_shipment` | POST | `/api/cmu/create.json` | body `{shipments:[{name, order, phone, add, pin, payment_mode:"Pickup", return_add, return_pin, ...}], pickup_location:{name}}` (or the documented `format=json&data=` text) |
| `delhivery_track_shipment` | GET | `/api/v1/packages/json/` | query `waybill` and/or `ref_ids` |
| `delhivery_edit_or_cancel_shipment` | POST | `/api/p/edit` | body `{waybill, cancellation:"true"}` or editable fields |
| `delhivery_validate_address` | POST | `/validate` | body `{address, req_id}` |
| `delhivery_create_pickup_request` | POST | `/fm/request/new/` | body `{pickup_time, pickup_date, pickup_location, expected_package_count}`. Optional: Delhivery says reverse pickups don't need it |

**Switching scenarios in AgenticOrg:** edit the connector's Base URL to `.../scenario/no_rider` (or `timeout`,
`malformed`, ...), run, then set it back. Check once with **Test Connection** that AgenticOrg keeps the base-URL
path when it joins tool paths. If it drops it, use the `X-Mock-Scenario` header (if the connector allows custom
headers) or the `MOCK_SCENARIO` env var plus a redeploy.

Suggested system-prompt facts for Reclaim (these are documented Delhivery semantics):
- HTTP 200 does not mean success. Read `success`, `rmk`, `error`, and per-shipment `status`.
- Manifest `Success` = pickup booked. Tracking `PP Scheduled/Dispatched` = not yet picked up. `PU *` = picked up and
  moving. `DL DTO` = item back at the warehouse. **None of these is proof the customer received money.**
- "Package might have been partially saved" and timeouts are ambiguous: track by `ref_ids` before re-creating.

---

## Demo script for judges

| # | Base URL / scenario | Mock does | Reclaim should |
|---|---|---|---|
| 1 | normal | pincode OK → manifest `Success` + waybill → tracking `PP Scheduled` | WAIT; never CLOSE on pickup alone |
| 2 | `rvp_dto` on tracking | `DL DTO` | Item returned → still verify the refund via the Pine Labs side before CLOSE |
| 3 | `no_rider` | manifest `success:false` "no field executive available ... retry later" | RETRY (if authorized) / inform customer / ESCALATE after retries |
| 4 | `no_rider_after_manifest` | created, but stuck `Scheduled` with a failed attempt | INVESTIGATE: created ≠ picked up |
| 5 | `timeout` | no answer within 10 s (shipment actually created) | RETRY carefully: track by order id first to avoid a duplicate |
| 6 | `malformed` / `malformed_fields` | unparseable / missing waybill | Do NOT assume success → INVESTIGATE (track) / ESCALATE |
| 7 | `low_balance` (documented) | insufficient balance, "might have been partially saved" | Not retryable by the agent → ESCALATE to a human (account issue) |
| 8 | pin `999999` / `400064` | NSZ / `pickup: "N"` | Ask the customer for another address, or ESCALATE |

---

## Example requests and responses

Real output from this server (fixed clock `MOCK_FIXED_NOW=2026-10-04T06:30:00Z`).

**Reverse-pickup manifest** (documented wrapper):

```bash
curl -s -X POST "$BASE/api/cmu/create.json" \
  -H "Authorization: Token $MOCK_API_TOKEN" -H 'Content-Type: application/json' \
  --data 'format=json&data={"shipments":[{"name":"Asha Rao","add":"H-36 Residency Greens, Sector 46, Gurugram","pin":"122003","phone":"+91-9876543210","order":"ORD-8500","payment_mode":"Pickup","products_desc":"Damaged blender","total_amount":"8500","return_add":"Reclaim Returns WH, Dharwad","return_pin":"580001","waybill":""}],"pickup_location":{"name":"Reclaim Returns WH"}}'
```

```json
{
  "success": true,
  "rmk": "",
  "shipments": [
    { "order": "ORD-8500", "waybill": "9221863157299", "payment_mode": "Pickup", "status": "Success", "remarks": "" }
  ],
  "_mock": { "scenario": "normal", "scenario_source": "default", "scenario_applied": false, "behavior": "normal",
             "envelope": "mock-defined (Delhivery has not published this response envelope)", "contract": "docs/delhivery-api-contract.md" }
}
```

**Tracking:**

```bash
curl -s "$BASE/api/v1/packages/json/?waybill=9221863157299" -H "Authorization: Token $MOCK_API_TOKEN"
```

```json
{
  "shipments": [
    {
      "Shipment": {
        "Status": { "Status": "Scheduled", "StatusDateTime": "2026-10-04T14:00:00.000", "StatusType": "PP",
                    "StatusLocation": "Gurugram_Mock_DC (Gurugram)", "Instructions": "Pickup scheduled" },
        "PickUpDate": "2026-10-05 12:00:00.000", "NSLCode": null, "Sortcode": null,
        "ReferenceNo": "ORD-8500", "AWB": "9221863157299"
      }
    }
  ],
  "_mock": { "scenario": "normal", "behavior": "normal", "...": "..." }
}
```

**No rider** (`-H 'X-Mock-Scenario: no_rider'`, or base URL `/scenario/no_rider`): HTTP 200

```json
{
  "success": false,
  "rmk": "MOCK SYNTHETIC FAILURE (not a documented Delhivery error): no field executive available to schedule the reverse pickup at pincode 122003 for the requested window. The shipment was not created; retry later.",
  "shipments": [ { "order": "ORD-8500", "waybill": null, "payment_mode": "Pickup", "status": "Fail", "remarks": "MOCK SYNTHETIC FAILURE ..." } ],
  "_mock": { "scenario": "no_rider", "scenario_applied": true, "behavior": "synthetic_competition_failure",
             "note": "Competition-only synthetic failure. This is NOT a documented Delhivery API behaviour.", "...": "..." }
}
```

**Low balance** (documented text): HTTP 200

```json
{
  "success": false,
  "rmk": "Crashing while saving package due to exception 'client manifest charge API failed due to insufficient balance'. Package might have been partially saved.",
  "shipments": [ { "order": "ORD-8500", "waybill": null, "payment_mode": "Pickup", "status": "Fail", "remarks": "..." } ],
  "_mock": { "scenario": "low_balance", "behavior": "documented_delhivery_error", "source": "Contract: LOW BALANCE (S10 FAQ, Common Remarks)", "...": "..." }
}
```

**Timeout**: after `MOCK_TIMEOUT_MS`, HTTP 504 `{"error": "MOCK SYNTHETIC: simulated upstream timeout", "_mock": {...}}`

**Malformed**: HTTP 200, `Content-Type: application/json`, body:

```text
{"success":true,"rmk":"","shipments":[{"order":"ORD-8500","waybill":"9221863157299","
```

**Malformed fields**: HTTP 200

```json
{ "success": "true", "rmk": "", "shipments": [ { "order": "ORD-8500", "payment_mode": "Pickup" } ] }
```

**Non-serviceable pincode** (`"pin": "999999"`): HTTP 200, `success: false`,
`rmk: "Crashing while saving package due to exception '999999 is non serviceable pincode'. Package might have been partially saved."`

**Unknown waybill:** HTTP 200 `{"error": "Data does not exists for provided Waybill(s)", "_mock": {...}}`

**Pincode serviceability** (documented sample pin): `GET /c/api/pin-codes/json/?filter_codes=400064`

```json
{ "delivery_codes": [ { "postal_code": { "city": "Mumbai", "cod": "N", "inc": "Mumbai MIDC (Maharashtra)", "district": "Mumbai",
  "pin": 400064, "max_amount": 0, "pre_paid": "Y", "cash": "Y", "state_code": "MH", "max_weight": 0, "pickup": "N", "repl": "Y",
  "covid_zone": null, "country_code": "IN", "is_oda": "N", "remarks": "" } } ] }
```

**Address validation:** `POST /validate` `{"address":"H-36 1st floor residency greens sector 46 gurgaon 122003","req_id":"ORD-8500"}`

```json
{
  "quality": "ok", "granularity_level": "PREMISE", "reason": "valid",
  "formatted_address": "H-36 1st Floor Residency Greens Sector 46 Gurgaon, Gurugram, 122003",
  "corrections": "<H-36 1st floor residency greens sector 46 gurgaon 122003|H-36 1st Floor Residency Greens Sector 46 Gurgaon, Gurugram, 122003>",
  "request_id": "cc1462b5-4aea-b220-0aa5-39416af5731c", "req_id": "ORD-8500"
}
```

**Cancel a scheduled reverse pickup:** `POST /api/p/edit` `{"waybill":"9221863157299","cancellation":"true"}` →
`{"success": true, "waybill": "9221863157299", "status": "Canceled", ...}`. Tracking then shows `CN Canceled`.

---

## Design notes and limitations

- **Deterministic:** waybills are `9` + journey digit (1 forward, 2 reverse pickup, 3 REPL) + 11 digits of
  `sha256(order|payment_mode)`, so the same order always gets the same waybill. Pickup ids and validation request ids
  are hashed too. With `MOCK_FIXED_NOW`, every byte of a response body is reproducible. The real Delhivery waybill
  series is account-specific and not public.
- **Stateless where it matters:** any mock-series waybill can be tracked on any serverless instance (cold starts
  included). Order-id lookups (`ref_ids`), cancellations and edits use per-instance memory, so on Vercel they hold
  while the same instance stays warm. A cold instance shows the default stage and `ReferenceNo: null`.
- **HTTP 200 for business failures** is a mock choice (Delhivery does not document its status codes). It also makes
  the "read the body, not the status" lesson visible. Auth → 401, malformed request → 400, rate limit → 403,
  timeout → 504.
- **Retry after timeout** with the same order returns the same waybill (no duplicate detection unless you select
  `duplicate_order`).
- The mock pincode dataset has one documented row (400064). The rest are clearly-marked mock rows; unknown valid pins
  are serviceable unless `MOCK_UNKNOWN_PINCODES=nsz`.
- The `/validate` verdicts use simple heuristics (6-digit pin present? known pin? house number present?), not
  Delhivery's model. Only the field names and enums are documented.
- No CORS headers: this is a server-to-server API (Delhivery's own FAQ advises against calling it from browsers).

## Project structure

```
reclaim/delhivery-mock/
├── api/index.ts                 Vercel function entry (all paths rewritten here)
├── src/
│   ├── app.ts                   router, scenario resolution, auth, timeout/malformed, _mock labels, logging
│   ├── contract.ts              documented error strings + status tables; mock-defined envelopes (one place to swap)
│   ├── scenarios.ts             scenario registry (documented / synthetic / stage)
│   ├── handlers/                pincode, manifest, pickup, tracking, edit, validate
│   ├── shipments.ts             waybill resolution + tracking stage logic
│   ├── pincodes.ts              mock pincode dataset (incl. the documented 400064 row)
│   ├── openapi.ts               /openapi.json
│   ├── config.ts  logger.ts  store.ts  util.ts  types.ts  node-adapter.ts
│   └── server.ts                local server
├── test/                        node:test suites (67 tests)
├── scripts/exercise.ts          hits every scenario on a live server
├── docs/
│   ├── delhivery-api-contract.md   source-backed contract (read this first)
│   └── sources/                 SHA256SUMS.txt + how to re-fetch the official files (copies kept local)
├── vercel.json  .env.example  package.json  tsconfig.json
```
