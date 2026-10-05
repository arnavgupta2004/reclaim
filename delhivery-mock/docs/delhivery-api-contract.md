# Delhivery API contract (source-backed) for the Reclaim mock server

Research date: **2026-10-04**. Every statement below is backed by an official Delhivery page, or is explicitly
marked **NOT VERIFIED — REQUIRES AUTHENTICATED DELHIVERY DOCUMENTATION**. Nothing here was filled in from memory,
blogs, GitHub, Stack Overflow, or third-party API descriptions.

## Sources

| ID | Official source | Access | Local copy |
|----|-----------------|--------|------------|
| S1 | B2C API docs index — https://one.delhivery.com/developer-portal/documents/b2c/ | Public, no login | — |
| S2 | B2C Pincode Serviceability — https://one.delhivery.com/developer-portal/document/b2c/detail/pincode-serviceability | Public | `sources/one.delhivery.com/pincode.ed8ad1b3.js` |
| S3 | B2C Shipment Creation — https://one.delhivery.com/developer-portal/document/b2c/detail/order-creation | Public | `sources/one.delhivery.com/order-creation.937ff826.js` |
| S4 | B2C Shipment Updation — https://one.delhivery.com/developer-portal/document/b2c/detail/order-updation | Public | `sources/one.delhivery.com/order-updation.eaec957a.js` |
| S5 | B2C Shipment Cancellation — https://one.delhivery.com/developer-portal/document/b2c/detail/order-cancellation | Public | `sources/one.delhivery.com/order-cancellation.40190545.js` |
| S6 | B2C Shipment Tracking — https://one.delhivery.com/developer-portal/document/b2c/detail/order-tracking | Public | `sources/one.delhivery.com/order-tracking.f48b0cad.js` |
| S7 | B2C Pickup Request Creation — https://one.delhivery.com/developer-portal/document/b2c/detail/pickup-scheduling | Public | `sources/one.delhivery.com/pickup-scheduling.5b268eb4.js` |
| S8 | B2C Fetch Waybill — https://one.delhivery.com/developer-portal/document/b2c/detail/fetch-waybill | Public | `sources/one.delhivery.com/waybill.4550d375.js` |
| S9 | B2C Package Lifecycle — https://one.delhivery.com/developer-portal/document/b2c/detail/package-lifecycle | Public | `sources/one.delhivery.com/package-lifecycle*.js` |
| S10 | B2C FAQ — https://one.delhivery.com/developer-portal/document/b2c/detail/faq | Public | `sources/one.delhivery.com/faq.9ed6c1cb.js` |
| S11 | B2C RVP QC 3.0 — https://one.delhivery.com/developer-portal/document/b2c/detail/rvp_qc | Public | `sources/one.delhivery.com/rvp_qc.6f1a3569.js` |
| S12 | B2C Webhook Functionality — https://one.delhivery.com/developer-portal/document/b2c/detail/webhook_functionality | Public | `sources/one.delhivery.com/webhook.f349228e.js` |
| S13 | B2C Steps of Integration — https://one.delhivery.com/developer-portal/document/b2c/detail/integration-steps | Public | `sources/one.delhivery.com/integration-steps.a9517311.js` |
| S14 | Delhivery Maps API reference (Address Validation) — https://www.delhivery.com/maps/reference#address-validation-api | Public | `sources/delhivery.com-maps/address-validation.txt` |
| S15 | Help Center: API Token Generation — https://help.delhivery.com/docs/api-token-generation | Public | `sources/help.delhivery.com/help_api-token-generation.md` |
| S16 | Help Center: Unified Wallet FAQs — https://help.delhivery.com/docs/unified-wallet-faqs | Public | `sources/help.delhivery.com/help_unified-wallet-faqs.md` |
| S17 | Help Center: B2C Pickup Requests — https://help.delhivery.com/docs/pickup-request | Public | (quoted below) |

How the copies were made: the developer portal is a single-page app. Its documentation text, parameter tables and
example cURL commands are compiled into JavaScript files served from
`https://one.delhivery.com/developer-portal/assets/<file>`. Those files were downloaded unmodified.
Each file's embedded `__file` marker (e.g. `.../views/B2C/detail-documents/order-creation.vue`) confirms it is a
**B2C** page. SHA-256 checksums are in `sources/SHA256SUMS.txt`. The copies themselves are kept locally and are
not redistributed in the public repository; `sources/README.md` explains how to re-download and verify them. The FAQ, package lifecycle, webhook and RVP QC text
quoted below was also read from the rendered pages in a browser on the same date.

### The single biggest gap

The public B2C pages document **request** parameters, example cURL requests, error *strings* and status vocabularies.
With one exception (pincode serviceability), they do **not** publish example **success response bodies** or the
JSON **envelope** that errors arrive in. Delhivery's "Execute API" playground shows live responses only after a
Delhivery One login (S10 Q1, S15). Wherever the mock has to return a body for one of these, the shape is
**mock-defined** and labelled that way in this document and in the code (`src/contract.ts`). Before the final
demo, check those envelopes against an authenticated Execute API session if you can get one.

---

## Authentication (B2C APIs)

Source:
S2, S3, S5, S6, S7 (example cURL headers); S10 "API Integration Related General FAQ's" Q1–Q2, "CREATE & UPDATE SHIPMENT API" Q2, Q7; S15

Method:
n/a

Path:
n/a

Authentication:
- Header format, verbatim from every B2C example cURL: `Authorization: Token XXXXXXXXXXXXXXXXX`
- Staging base URL: `https://staging-express.delhivery.com` (all B2C example cURLs)
- Production base URL: `https://track.delhivery.com`. S10 Q7: "for the live environment, you just need to replace
  "staging-express" with "track" for all API's endpoints and the live token will be different from the Test environment".
  S2 lists both "Test Environment URL" and "Production Environment URL" explicitly. Every B2C page builds its
  "Production Environment URL" as `"https://track.delhivery.com/" + <path>` (shared component
  `sources/one.delhivery.com/b2c-enhanced-base.c4efcc91.js`).
- Same token for all B2C APIs: S10 General Q2: "Yes, the token remains constant for all API's, till there is a switch in
  environments (Testing/Production) as the token will be different for testing and production environment".
- Token lifetime: S10 General Q1: "The authorization token is static and does not expire." S15 adds that requesting a
  new live token from the panel invalidates the old one immediately.
- Exception: the Fetch Waybill APIs pass the token as a `token` **query parameter**, not a header (S8 cURL:
  `.../waybill/api/bulk/json/?token=xxxxxxxxxxxxxxxx&count=5`).

Request:
n/a

Example request:
`--header 'Authorization: Token xxxxxxxxxxxxxxxx'`

Success response:
n/a

Documented errors:
- Missing token (manifestation): "Authentication credentials were not provided" (S10 Common Remarks).
- Wrong token (pincode API): "Login or API Key Required" (S10 Pincode Common Remarks).
- Token/environment mismatch (manifestation): `"rmk": "Package creation API error.Package might be saved.Please contact tech.admin@delhivery.com. Error message is 'NoneType' object has no attribute 'end_date' . Quote this error message while reporting."` (S10 Q9).
- Token/environment mismatch (pickup request): "There has been an error but we were asked to not let you see that. Please contact the dev team." (S10 Pickup Common Remarks).
- HTTP status codes for auth failures: **NOT VERIFIED — REQUIRES AUTHENTICATED DELHIVERY DOCUMENTATION**.

Notes:
The mock enforces `Authorization: Token <MOCK_API_TOKEN>` when `MOCK_API_TOKEN` is set. It returns 401 with the
documented strings above. The 401 status and the `{"error": ...}` envelope are mock-defined.

---

## Pincode Serviceability

Source:
S2 (endpoint, parameters, cURL); S10 "CHECK PINCODE SERVICEABILITY API" Q1–Q2 and Common Remarks (response sample, errors)

Method:
`GET`

Path:
`/c/api/pin-codes/json/`

Authentication:
`Authorization: Token <token>`

Request:

| Param | Type | Mandatory | Description (verbatim) |
|---|---|---|---|
| `filter_codes` | Integer | False | "Pincodes for which the serviceability needs to be checked, pass one pincode at a time." |

S2 rules (verbatim): "If the API response is an empty list, the pincode is non-serviceable (NSZ)." /
"If filter_code is not passed, the API returns both serviceable and embargoed pincodes." /
"In the response, remark as "Embargo" indicates temporary NSZ, while a blank remark means the pincode is serviceable."

Example request:
```bash
curl --request GET \
  --url 'https://staging-express.delhivery.com/c/api/pin-codes/json/?filter_codes=194103' \
  --header 'Authorization: Token xxxxxxxxxxxxxxxx'
```

Success response (S10 Q2, "refer to the initial section of the response provided below". It is a partial excerpt. The
original has a trailing comma after `"remarks": ""`, which has been removed here):
```json
{
  "delivery_codes": [
    {
      "postal_code": {
        "city": "Mumbai",
        "cod": "N",
        "inc": "Mumbai MIDC (Maharashtra)",
        "district": "Mumbai",
        "pin": 400064,
        "max_amount": 0.0,
        "pre_paid": "Y",
        "cash": "Y",
        "state_code": "MH",
        "max_weight": 0.0,
        "pickup": "N",
        "repl": "Y",
        "covid_zone": null,
        "country_code": "IN",
        "is_oda": "N",
        "remarks": ""
      }
    }
  ]
}
```
Field meaning (S10 Q2): `remarks: ""` = serviceable; `remarks: "Embargo"` = temporary NSZ; check `pre_paid`, `pickup`,
`repl` for the service type, where "Y" = available and "N" = not available.

Documented errors:
- Non-serviceable / invalid pincode: `{"delivery_codes": []}`. S10 reason: "The Pin code for which you are trying to check
  the serviceability does not seems to be the correct." S2: an empty list means NSZ.
- Wrong token: "Login or API Key Required".

Notes:
- The S10 sample is labelled as the "initial section" of the response. Any keys after `delivery_codes`:
  **NOT VERIFIED — REQUIRES AUTHENTICATED DELHIVERY DOCUMENTATION**. The mock returns only `delivery_codes`.
- For an RVP, the field to check is `pickup`. In the documented sample (pin 400064), `pickup` is "N", so that pin is
  serviceable for prepaid delivery but **not** for reverse pickup. The mock reproduces this record exactly.
- A heavy-product variant (`GET /api/dc/fetch/serviceability/pincode?product_type=Heavy&pincode=`) is documented in S2.
  It is not needed for Reclaim and is not implemented.

---

## Shipment Manifestation / Creation (forward, reverse pickup "RVP", replacement)

Source:
S3 (endpoint, parameter table, cURL, RVP rules); S11 (full RVP example payload); S10 "CREATE & UPDATE SHIPMENT API"
Q3, Q5, Q6 and Common Remarks

Method:
`POST`

Path:
`/api/cmu/create.json`

Authentication:
`Authorization: Token <token>`. The S3 cURL also sends `Accept: application/json` and `Content-Type: application/json`.

Request:
- **Wrapper:** the body is the literal prefix `format=json&data=` followed by a JSON object (S3 cURL `text:"format=json&data="+JSON.stringify(...)`).
  S10 Q3: "The format=json&data= (without quotes) parameter is mandatory in the request payload for order creation".
  S3: "The raw JSON body does not accept special characters: "&", "#", "%", ";", "\". Use URL-encoded payloads instead."
- **Inconsistency in the official docs:** the MPS example cURL on the same page (S3, `manifestcurl`) sends plain JSON
  with no `format=json&data=` prefix.
- JSON object: `{"shipments": [ {...} ], "pickup_location": {"name": "<registered warehouse name>"}}`.
  The S11 RVP example also includes `"client": "pass the registered client name"` inside each shipment.
- Shipment fields (S3 parameter table, verbatim mandatory flags):

| Field | Type | Mandatory | Description |
|---|---|---|---|
| name | string | True | Name of the consignee |
| order | string | True | Order ID (S10: max 50 chars; must be unique per account) |
| phone | string | True | Consignee phone number |
| add | string | True | Address of the consignee |
| pin | integer | True | Pincode of the consignee |
| payment_mode | string | True | "**Pickup** for reverse shipments, **COD** or **Prepaid** for forward shipments and **REPL** for replacement shipments" |
| pickup_location | string | True | "Name should be exactly the same as the name of the WH registered. It is case/space sensitive." (sent as `pickup_location.name`) |
| address_type | string | False | home/office |
| ewbn | string | False | Ewaybill number (packages ≥ 50k) |
| hsn_code | string | False | HSN code |
| shipping_mode | string | False | Surface/Express |
| seller_inv | string | False | Seller invoice |
| city | string | False | City of the consignee |
| weight | float | False | Weight (gms) |
| return_name, return_address, return_city, return_phone, return_state, return_country | string | False | Return details |
| return_pin | integer | False | Return pincode |
| seller_name, seller_add | string | False | Seller details |
| fragile_shipment, dangerous_good, plastic_packaging | boolean | False | Flags |
| shipment_height, shipment_width, shipment_length | float | False | cm |
| cod_amount, total_amount | float | False | Amounts |
| products_desc | string | False | Product description |
| state, country | string | False | Consignee state / country |
| waybill | string | False | "SPS: Waybill can be passed in the payload or can be skipped as well. MPS: Waybill needs to be passed for each box explicitly in the API." |
| quantity | string | False | Quantity |
| transport_speed | string | False | F = Next Day Delivery, D = Standard |

Note: the parameter table says `return_address`, but the S3 example payload uses `return_add`, and so does the S3 RVP
text ("The return_add and other return-related fields will be used to define the drop/delivery address"). The mock
accepts both.

- **Reverse pickup (RVP) rules** (S3, verbatim):
  - "The order creation process is the same for both forward flow ... and reverse flow ..., differing only in the payment_mode key"
  - "Set the payment mode as "Pickup" in the manifest payload."
  - "When "Pickup" is used as the payment mode, the customer information will be treated as the pickup location. The return_add and other return-related fields will be used to define the drop/delivery address."
  - "If both a return address and a pickup location are provided for a pickup shipment, the system will prioritize the return address, and the shipment will be delivered there."
- **RVP QC (optional)** (S11): `"qc_type": "param"` plus a `"custom_qc"` array. S10 Q5: QC is optional and only
  applies with business-team alignment. The mock accepts and ignores QC fields.
- **Waybill can be omitted:** S10 Q6, verbatim: "When calling the API, leave the "waybill" field blank. The API will
  return a dynamically generated waybill in the response." Pre-fetched waybills are mandatory only for MPS (S3).

Example request (S3 cURL; RVP fields per S3/S11):
```bash
curl --request POST \
  --url https://staging-express.delhivery.com/api/cmu/create.json \
  --header 'Authorization: Token XXXXXXXXXXXXXXXXX' \
  --header 'Accept: application/json' \
  --header 'Content-Type: application/json' \
  --data 'format=json&data={"shipments":[{"name":"Consignee name","add":"Huda Market, Haryana","pin":"110042","city":"Gurugram","state":"Haryana","country":"India","phone":"9999999999","order":"Test Order 01","payment_mode":"Pickup","return_add":"...","return_pin":"...","waybill":""}],"pickup_location":{"name":"warehouse_name"}}'
```

Success response:
**NOT VERIFIED — REQUIRES AUTHENTICATED DELHIVERY DOCUMENTATION.** The only public statement is that a dynamically
generated waybill is returned "in the response" (S10 Q6). The key names and envelope are not published.
→ The mock uses a **mock-defined** envelope (see "Mock-defined shapes" at the end).

Documented errors (S10 Common Remarks and Q8–Q11; error strings verbatim):
| Trigger | Error text |
|---|---|
| Missing token | "Authentication credentials were not provided" |
| Wrong client name | "shipment list contains no data" |
| Special characters | "Unterminated string starting at: line … column … (char …)" |
| Missing `format=json&data=` | "format key missing in the post" |
| Bad / consumed waybill | "Unable to consume waybill XXXX" |
| Wrong warehouse name | `"rmk": "ClientWarehouse matching query does not exist."` |
| Inactive warehouse | `"rmk": "Client-Warehouse is not active."` |
| Suspicious consignee | "Crashing while saving package due to exception suspicious order/consignee" |
| Seller PUR failure rate | "Crashing while saving package due to exception PUR (shipment pickup from seller) failure rate of the seller is very high." |
| Duplicate order | "Duplicate Order Id" |
| **Insufficient wallet balance** | "Crashing while saving package due to exception 'client manifest charge API failed due to insufficient balance'. Package might have been partially saved." |
| `shipments` not a list | "Error message is 'unicode' object has no attribute 'get'." |
| payment_mode not enabled | "Crashing while saving package due to exception 'Package type Pickup/COD/REPL/Prepaid not serviceable for this account "Package might have been partially saved." |
| Non-serviceable pincode | "Crashing while saving package due to exception '1100** is non serviceable pincode'. Package might have been partially saved." |
| Bad phone | "Incorrect phone number(s) for order *****" (allowed prefixes: 91, +91, +91-, 91-, 0) |
| Duplicate waybill | "Duplicate waybill" |
| Order ID > 50 chars | "oid does not pass the validator <lambda>.check if there any extra character or dots in column" |
| Pincode capacity | "Crashing while saving package due to exception Manifestation failed as the pickup capacity has exceeded the available capacity of this pincode. Package might have been partially saved." |
| Consignee blocked (returns) | "Crashing while saving package due to exception Shipment restricted based on historical delivery outcomes. Package might have been partially saved." |
| Client inactive | `"rmk": "client is not active"` |
| Token/environment mismatch | `"rmk": "Package creation API error.Package might be saved. ... 'NoneType' object has no attribute 'end_date' ..."` |

Notes:
- The FAQ shows several errors with the key **`rmk`**, so the mock puts error text in `rmk`. The rest of the error
  envelope and the HTTP status codes: **NOT VERIFIED — REQUIRES AUTHENTICATED DELHIVERY DOCUMENTATION.**
- Several documented errors say "Package might have been partially saved". The **documented** behaviour is therefore
  that a failure response does not guarantee nothing was created. That is the evidence-uncertainty Reclaim must
  investigate.
- Rate limit (S3): 20000 requests / 5 min / IP; average latency 283.57 ms, P99 1.59 s (production).

---

## Pickup Request Creation (PUR)

Source:
S7 (endpoint, parameters, cURL, rules); S10 "Pickup Request Creation API" Q1–Q6 and Common Remarks; S17

Method:
`POST`

Path:
`/fm/request/new/`

Authentication:
`Authorization: Token <token>`, `Content-Type: application/json`

Request (S7):

| Param | Type | Mandatory | Description |
|---|---|---|---|
| pickup_time | String | True | Time for the pickup (hh:mm:ss) |
| pickup_date | String | True | Date for the pickup (YYYY-MM-DD) |
| pickup_location | String | True | Registered client warehouse from where the shipment is to be picked |
| expected_package_count | Integer | True | Count of packages that need to be picked up |

Example request (S7):
```bash
curl --request POST \
  --url https://staging-express.delhivery.com/fm/request/new/ \
  --header 'Authorization: Token XXXXXXXXXXXXXXXXX' \
  --header 'Content-Type: application/json' \
  --data '{"pickup_time":"11:00:00","pickup_date":"2023-12-29","pickup_location":"warehouse_name","expected_package_count":1}'
```

Success response:
**NOT VERIFIED — REQUIRES AUTHENTICATED DELHIVERY DOCUMENTATION.** S17 (Help Center) documents the pickup request
statuses: Scheduled ("Newly created Pickup Request"), Out for Pickup, Picked, Cancelled. → The mock uses a
mock-defined envelope with `"status": "Scheduled"`.

Documented errors (S10 Pickup Common Remarks, verbatim):
| Trigger | Error text |
|---|---|
| Open PUR exists for location | "A Pickup Request **** for this Pickup Location Already Exist." |
| Token/environment mismatch | "There has been an error but we were asked to not let you see that. Please contact the dev team." |
| Date in the past | `"pickup_date": "Pickup date cannot be in past"` |
| Inactive centre | "Wrong/Inactive center for this warehouse" |
| Wrong location | "Invalid Pickup Location ClientWarehouse matching query does not exist." |
| Date > 7 days ahead | "Pickup date should not be more than 7 days from pickup creation date" |
| Auto-pickup account | "Client is on auto pickup and please raise a ticket to firstmile_servicing@delhivery.com" |
| **Insufficient wallet balance** | the same manifest-charge error as above. S10 says it occurs "while Manifesting the Shipment OR generating the Pickup Request" |

Notes:
- **Not required for reverse shipments.** S10 Q2: "No, pickup requests for reverse shipments are scheduled
  automatically. There is no need to create pickup requests manually for reverse pickups." For Reclaim's return flow,
  the RVP manifest (`payment_mode: "Pickup"`) is the pickup booking.
- A PUR is raised per warehouse, not per waybill. A second PUR for the same warehouse on the same day is allowed only
  after the first one is closed (S7).
- Completion: "A pickup request is considered complete when a Field Executive (FE) arrives at the pickup location and
  collects the shipments." (S10 Q4).
- **"No rider available": NOT a documented Delhivery API error.** Neither the B2C portal nor the Help Center
  documents a "no rider" or "field executive unavailable" response. S17 says only: "If in case, due to any
  circumstances, if the pickup of your shipments have failed, we would request you to raise a ticket with the Delhivery
  Support Team". The mock's `no_rider` scenarios are therefore **competition-only synthetic failures** and are
  labelled as such in every response.
- Not documented for B2C: a pickup-request cancel endpoint. (The portal's "cancel pickup" page is the B2B/LTL API on
  `ltl-clients-api.delhivery.com`, so it does not apply.)

---

## Shipment Tracking

Source:
S6 (endpoint, parameters, cURL); S10 "TRACK SHIPMENT API" Q1–Q3 and Common Remarks, "Webhook Integration" Q1–Q3;
S9 and S12 (status vocabularies)

Method:
`GET`

Path:
`/api/v1/packages/json/`

Authentication:
`Authorization: Token <token>`

Request (S6):

| Param | Type | Mandatory | Description |
|---|---|---|---|
| waybill | String | True | Waybill Number |
| ref_ids | String | False | Order_Id |

S6: "The track API takes as input as either waybill number or order ID" / "Track upto 50 waybills (comma-separated)
with a single request". Rate limit: 750 requests / 5 min (S6, S10).

Example request (S6):
```bash
curl --request GET \
  --url 'https://staging-express.delhivery.com/api/v1/packages/json/?waybill=1122345678722&ref_ids=' \
  --header 'Authorization: Token XXXXXXXXXXXXXXXXXX'
```

Success response:
- **Response envelope for the Track API: NOT VERIFIED — REQUIRES AUTHENTICATED DELHIVERY DOCUMENTATION.**
- Per-shipment object: the only public example of tracking data keys is the **webhook (Scan Push) default payload**
  (S10 "Webhook Integration" Q3), verbatim keys and example values:
```json
"Shipment": {
  "Status": {
    "Status": "Manifested",
    "StatusDateTime": "2019-01-09T17:10:42.767",
    "StatusType": "UD",
    "StatusLocation": "Chandigarh_Raiprkln_C (Chandigarh)",
    "Instructions": "Manifest uploaded"
  },
  "PickUpDate": "2019-01-09 17:10:42.543",
  "NSLCode": "X-UCI",
  "Sortcode": "IXC/MDP",
  "ReferenceNo": "28",
  "AWB": "XXXXXXXXXXXX"
}
```
  S12 says Delhivery may add data or map a custom payload for webhooks, so the Track API object could have more fields.
  The mock uses exactly these documented keys for each shipment, inside a **mock-defined** list envelope.

- Documented status values (S9 Package Lifecycle, S12 Webhook). **Reverse pickup (payment_mode Pickup):**

| StatusType | Status | Description (S9) |
|---|---|---|
| PP | Open | When the reverse pickup request is successfully created and registered in the system. |
| PP | Scheduled | When the pickup from the customer's location has been scheduled. |
| PP | Dispatched | When the field executive is dispatched to pick up the shipment from the customer. |
| PU | In Transit | When the reverse consignment has been picked up and is in transit to the facility. |
| PU | Pending | When the reverse shipment has reached the origin DC but is not yet dispatched to the client. |
| PU | Dispatched | When the reverse shipment is dispatched for delivery back to the client warehouse. |
| DL | DTO | Delivered To Origin; when the reverse shipment is successfully delivered back to the client. |
| CN | Canceled | When the reverse shipment is cancelled by the client/seller in the journey. |
| CN | Closed | When the reverse shipment request is closed by the client/seller. |

  **Forward (COD/Prepaid):** UD Manifested, UD Not Picked, UD In Transit, UD Pending, UD Dispatched, DL Delivered.
  **Return-to-origin:** RT In Transit, RT Pending, RT Dispatched, DL RTO. **REPL:** combines the UD/PU/DL/RT sets (S9).
  S10 Webhook Q1: UD = forward, RT = reverse direction. S12: "When a pickup request is scheduled, it automatically moves
  from "open" to "scheduled" status".
- Documented NSL codes: `X-UCI` (the Manifested example above); `EOD-777 (RVP QC Fail)` and
  `EOD-21 (Pickup request canceled)` (S10 NDR remarks). The NSL code for each other status is **NOT VERIFIED**.

Documented errors (S10 Track Common Remarks, verbatim):
| Trigger | Error text |
|---|---|
| Waybill not manifested / other account | "Data does not exists for provided Waybill(s)" |
| Token and waybill from different accounts | "No such waybill or order ID found" |
| Rate limit exceeded | "403 Forbidden" (AWS WAF; wait ≥ 30 s; stay below 750 req / 5 min) |

Notes:
The error envelope (key name) for tracking errors is **NOT VERIFIED**. The mock uses `{"error": "<documented text>"}`.
`"error"` is the key the FAQ shows for another B2C API (Calculate Shipping Cost), so it is a guess, not a confirmed match.

---

## Fetch Waybill

Source:
S8; S10 "FETCH WAYBILL API"

Method:
`GET`

Path:
Bulk: `/waybill/api/bulk/json/?token=<token>&count=<n>`. Single: `/waybill/api/fetch/json/?token=<token>`

Authentication:
`token` query parameter (S8 cURL). No Authorization header is shown.

Request:
`count` (Integer, mandatory for bulk, max 10,000). `token` (String, mandatory).

Example request:
`GET https://staging-express.delhivery.com/waybill/api/bulk/json/?token=xxxxxxxxxxxxxxxx&count=5`

Success response:
**NOT VERIFIED — REQUIRES AUTHENTICATED DELHIVERY DOCUMENTATION.**

Documented errors:
"Bad Request! Invalid count for client Test"; "Bad Request! Count value should be less than 10000"; "Unable to consume
waybill for your account." (if more than 25 freshly fetched waybills are used immediately).

Notes:
**Not required for our flow.** For single-piece shipments the waybill "can be passed in the payload or can be skipped"
(S3), and the manifest response returns a generated waybill (S10 Q6). **Not implemented in the mock.**

---

## Shipment Cancellation

Source:
S5

Method:
`POST`

Path:
`/api/p/edit`

Authentication:
`Authorization: Token <token>`, `Accept: application/json`, `Content-Type: application/json`

Request:
| Param | Type | Mandatory | Description |
|---|---|---|---|
| waybill | String | True | Waybill number of the shipment |
| cancellation | String | True | "This key needs to be passed as true to cancel a shipment" |

Example request (S5):
```bash
curl --request POST --url https://staging-express.delhivery.com/api/p/edit \
  --header 'Authorization: Token XXXXXXXXXXXXXXXXX' --header 'Content-Type: application/json' \
  --data '{"waybill":"6945XXXXXXXX","cancellation":"true"}'
```

Success response:
**NOT VERIFIED — REQUIRES AUTHENTICATED DELHIVERY DOCUMENTATION.**

Documented rules (S5, verbatim):
- RVP (Payment mode: Pickup): cancellation allowed only in status "Scheduled".
- Forward / REPL: allowed in "Manifested", "In Transit", "Pending".
- "If a scheduled shipment is canceled, its status updates to Canceled with the status type CN (Cancellation)."
- "If a manifested shipment is canceled before pickup, its status remains Manifested with the status type UD (Undelivered)."
- "If a shipment in In Transit or Pending state is canceled, the status stays In Transit and the status type changes to RT (Return to Origin)."

Documented errors:
The error text for cancelling in a disallowed status: **NOT VERIFIED — REQUIRES AUTHENTICATED DELHIVERY DOCUMENTATION.**

Notes:
Useful for the demo: after a failed or stuck reverse pickup, Reclaim can cancel and re-book. Implemented, with the
mock-defined envelope.

---

## Shipment Updation

Source:
S4

Method:
`POST`

Path:
`/api/p/edit` (same path as cancellation)

Authentication:
`Authorization: Token <token>`

Request:
`waybill` (mandatory); optional `name`, `phone`, `pt` (payment mode), `add`, `products_desc`, `gm` (weight, gms),
`shipment_height`, `shipment_width`, `shipment_length`.

Example request (S4):
`{"waybill":"843xxxxxxxxx","pt":"COD/Pre-paid","cod":100,"shipment_height":40.2,"gm":100.2}`

Success response:
**NOT VERIFIED — REQUIRES AUTHENTICATED DELHIVERY DOCUMENTATION.**

Documented rules (S4):
- RVP edits are allowed only in "Scheduled". Forward / REPL edits only in Manifested / In Transit / Pending.
- "Edit is not allowed on any Dispatched and Terminal status like Delivered, DTO, RTO, LOST and Closed".
- Payment mode: Pickup↔Prepaid and Pickup↔COD conversions are not allowed. COD→Prepaid is allowed; Prepaid→COD is
  allowed with a COD amount.

Documented errors:
**NOT VERIFIED — REQUIRES AUTHENTICATED DELHIVERY DOCUMENTATION.**

Notes:
Implemented minimally (status gate + the field list above), so the agent can correct an address or phone number on a
scheduled RVP.

---

## Address Validation (Delhivery Maps)

Source:
S14 (full public schema)

Method:
`POST`

Path:
`/validate`

Authentication:
`Authorization: Bearer <your-jwt-token>`. Real base URL: `https://gateway-maps-pub-int.delhivery.com`. This is a
**different product, base URL and auth scheme** from the B2C APIs.

Request:
JSON: `address` (string, required: "Raw delivery address string (Indian addresses only)"), `req_id` (string,
optional, echoed back).

Example request:
```json
{ "address": "H-36 1st floor residency greens sector 46 gurgaon", "req_id": "ORDER-12345" }
```

Success response (S14, verbatim example):
```json
{
  "quality": "ok",
  "granularity_level": "PREMISE",
  "reason": "valid",
  "formatted_address": "H-36, 1st Floor, Residency Greens, Sector 46, Gurugram, Haryana, 122003",
  "corrections": "<h36|H-36>, <1st floor|1st Floor>, <residency greens|Residency Greens>, Sector 46, <gurgaon|Gurugram>, <|Haryana, 122003>",
  "request_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "req_id": "ORDER-12345"
}
```
Enums: `quality` ∈ {ok, not_ok}; `granularity_level` ∈ {PREMISE, STREET_LANDMARK, SUBLOCALITY_VILLAGE, LOCALITY,
CITY_PINCODE, NONE}; `reason` ∈ {valid, incomplete, correction_needed, invalid_or_junk}. `formatted_address` is
"Empty if invalid_or_junk."

Documented errors:
HTTP 400 Bad request, 401 Unauthorized, 429 Rate limit exceeded, 500 Internal server error, 504 Timeout. The error
body schema is **not shown** on the public page (NOT VERIFIED).

Notes:
A bad address comes back as HTTP 200 with `quality: "not_ok"`, not as an HTTP error. The mock serves `/validate` on the
same host as the B2C mock for connector convenience. For that reason it accepts either `Bearer` or `Token` with the
mock token.

---

## LOW BALANCE (insufficient wallet balance)

Source:
S10 Common Remarks (developer-portal FAQ); S16 (Help Center, wallet)

Verified, verbatim (S10):
> Getting the error "Crashing while saving package due to exception 'client manifest charge API failed due to
> insufficient balance'. Package might have been partially saved." — This error while Manifesting the Shipment OR
> generating the Pickup Request. — So to fix the issue you will have to recharge your wallet with a minimum of 500 to
> Manifest the shipment and raise the Pickup request.

S16 (Unified Wallet FAQ): when the wallet balance "goes beyond the permitted negative limit ... certain transactions
may be temporarily blocked until the balance is corrected" (Finlock).

Mock behaviour: the `low_balance` scenario returns this exact string in `rmk` on `/api/cmu/create.json` and in `error`
on `/fm/request/new/`. **This is a documented Delhivery error.** The envelope and HTTP status are mock-defined.

---

## Mock-defined shapes (where the official documentation is silent)

These are **not** Delhivery's verified formats. They live in `src/contract.ts`, so they can be swapped for the real
envelopes once verified against authenticated docs.

| Endpoint | Mock-defined part | Mock shape |
|---|---|---|
| `/api/cmu/create.json` success | whole envelope | `{"success": true, "rmk": "", "shipments": [{"order", "waybill", "payment_mode", "status": "Success", "remarks": ""}]}` |
| `/api/cmu/create.json` error | envelope (the `rmk` key and its text are documented) | `{"success": false, "rmk": "<documented text>", "shipments": [{"order", "waybill": null, "status": "Fail", "remarks": "<text>"}]}` |
| `/fm/request/new/` success | whole envelope (the "Scheduled" status word is documented) | `{"success": true, "pickup_id", "pickup_location", "pickup_date", "pickup_time", "expected_package_count", "status": "Scheduled"}` |
| `/fm/request/new/` error | envelope (texts documented) | `{"success": false, "error": "<documented text>"}`; for a past date `{"pickup_date": "Pickup date cannot be in past"}` (documented form) |
| `/api/v1/packages/json/` | list envelope (each `Shipment` object uses the documented keys) | `{"shipments": [{"Shipment": {...documented keys...}}]}`; errors `{"error": "<documented text>"}` |
| `/api/p/edit` | whole envelope | `{"success": true, "waybill", "status", "remark"}` / `{"success": false, "waybill", "error"}` |
| All endpoints | HTTP status codes | 200 for business outcomes (including documented business errors), 400 malformed request, 401 auth, 403 rate limit, 404 unknown route, 504 timeout |
| Waybill numbers | numbering series | 13-digit numeric, deterministic per (order, payment_mode); see README |

Every mock response also carries an `X-Mock-Scenario` header. Unless `MOCK_INCLUDE_META=false` is set, it also
carries a `_mock` object stating the scenario, whether the behaviour is a documented Delhivery error, and whether it
is a competition-only synthetic failure. The deliberately malformed scenarios omit `_mock` from the body.
