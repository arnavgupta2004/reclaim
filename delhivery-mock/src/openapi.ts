// OpenAPI 3.0 description of the mock (served at GET /openapi.json) for connector/tool registration.
// Paths, parameters and request fields follow docs/delhivery-api-contract.md; response schemas marked
// "mock-defined" are not published by Delhivery.

const tokenAuth = [{ DelhiveryToken: [] }];

const err = (description: string) => ({
  description,
  content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
});

export function buildOpenApi(serverUrl: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Reclaim Delhivery mock (B2C + Maps address validation)',
      version: '1.0.0',
      description:
        'Mock of documented Delhivery B2C endpoints for the Reclaim agent. Not affiliated with Delhivery. ' +
        'HTTP 200 does NOT imply success: always read `success` / `rmk` / `error` in the body. ' +
        'Scenario selection: header X-Mock-Scenario or base-URL prefix /scenario/<name>.',
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        DelhiveryToken: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'Value must be "Token <MOCK_API_TOKEN>" (documented Delhivery B2C scheme).',
        },
      },
    },
    security: tokenAuth,
    paths: {
      '/c/api/pin-codes/json/': {
        get: {
          operationId: 'delhivery_pincode_serviceability',
          summary: 'B2C Pincode Serviceability. Empty delivery_codes = not serviceable (NSZ). remarks "Embargo" = temporary NSZ. For a reverse pickup check postal_code.pickup == "Y".',
          parameters: [{ name: 'filter_codes', in: 'query', required: false, schema: { type: 'string' }, description: 'One 6-digit pincode' }],
          responses: { '200': err('{"delivery_codes":[{"postal_code":{...}}]} (documented shape)'), '401': err('Auth error') },
        },
      },
      '/api/cmu/create.json': {
        post: {
          operationId: 'delhivery_create_shipment',
          summary:
            'B2C Shipment Manifestation. Reverse pickup = payment_mode "Pickup": customer address is the pickup point, return_* fields are the drop. Leave waybill empty to have one generated. A "Success" here means the pickup was booked, NOT that anything was picked up or refunded.',
          requestBody: {
            required: true,
            description:
              'Documented wire format is the text `format=json&data=<JSON>`. The mock also accepts the JSON object directly (flagged in _mock.warnings) unless MOCK_STRICT_FORMAT=true.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['shipments', 'pickup_location'],
                  properties: {
                    shipments: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['name', 'order', 'phone', 'add', 'pin', 'payment_mode'],
                        properties: {
                          name: { type: 'string' }, order: { type: 'string', maxLength: 50 }, phone: { type: 'string' },
                          add: { type: 'string' }, pin: { type: 'string' }, city: { type: 'string' }, state: { type: 'string' },
                          country: { type: 'string' },
                          payment_mode: { type: 'string', enum: ['Pickup', 'COD', 'Prepaid', 'REPL'] },
                          products_desc: { type: 'string' }, total_amount: { type: 'string' }, cod_amount: { type: 'string' },
                          quantity: { type: 'string' }, weight: { type: 'string' }, waybill: { type: 'string' },
                          return_name: { type: 'string' }, return_add: { type: 'string' }, return_city: { type: 'string' },
                          return_state: { type: 'string' }, return_country: { type: 'string' }, return_pin: { type: 'string' },
                          return_phone: { type: 'string' }, seller_name: { type: 'string' }, seller_add: { type: 'string' },
                          shipping_mode: { type: 'string', enum: ['Surface', 'Express'] },
                        },
                      },
                    },
                    pickup_location: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
                  },
                },
              },
              'text/plain': { schema: { type: 'string', example: 'format=json&data={"shipments":[...],"pickup_location":{"name":"..."}}' } },
            },
          },
          responses: {
            '200': err('mock-defined: {"success":bool,"rmk":string,"shipments":[{"order","waybill","payment_mode","status":"Success|Fail","remarks"}]}'),
            '400': err('Malformed request'),
            '401': err('Auth error'),
            '504': err('Timeout scenario'),
          },
        },
      },
      '/fm/request/new/': {
        post: {
          operationId: 'delhivery_create_pickup_request',
          summary:
            'B2C Pickup Request Creation for a warehouse (forward shipments). Delhivery documents that reverse pickups are scheduled automatically and do not need this.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['pickup_time', 'pickup_date', 'pickup_location', 'expected_package_count'],
                  properties: {
                    pickup_time: { type: 'string', example: '11:00:00' },
                    pickup_date: { type: 'string', example: '2026-10-05' },
                    pickup_location: { type: 'string' },
                    expected_package_count: { type: 'integer', minimum: 1 },
                  },
                },
              },
            },
          },
          responses: { '200': err('mock-defined: {"success":true,"pickup_id",...,"status":"Scheduled"} or {"success":false,"error"}'), '400': err('Validation error') },
        },
      },
      '/api/v1/packages/json/': {
        get: {
          operationId: 'delhivery_track_shipment',
          summary:
            'B2C Shipment Tracking. Reverse pickup statuses: PP Open/Scheduled/Dispatched -> PU In Transit/Pending/Dispatched -> DL DTO; CN Canceled/Closed. DL DTO = item back at the warehouse; it is NOT proof of a refund.',
          parameters: [
            { name: 'waybill', in: 'query', required: false, schema: { type: 'string' }, description: 'Waybill(s), comma-separated, max 50' },
            { name: 'ref_ids', in: 'query', required: false, schema: { type: 'string' }, description: 'Order id' },
          ],
          responses: { '200': err('mock-defined list: {"shipments":[{"Shipment":{documented keys}}]} or {"error": "..."}'), '403': err('Rate limited') },
        },
      },
      '/api/p/edit': {
        post: {
          operationId: 'delhivery_edit_or_cancel_shipment',
          summary: 'B2C Shipment Updation / Cancellation. Cancel: {"waybill","cancellation":"true"}. Reverse pickups can be cancelled/edited only while Scheduled.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['waybill'],
                  properties: {
                    waybill: { type: 'string' }, cancellation: { type: 'string', enum: ['true'] }, name: { type: 'string' },
                    phone: { type: 'string' }, add: { type: 'string' }, products_desc: { type: 'string' }, pt: { type: 'string' },
                    gm: { type: 'number' }, shipment_height: { type: 'number' }, shipment_width: { type: 'number' }, shipment_length: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: { '200': err('mock-defined: {"success":bool,"waybill","status",...}') },
        },
      },
      '/validate': {
        post: {
          operationId: 'delhivery_validate_address',
          summary: 'Delhivery Maps Address Validation. quality "not_ok" means the address has issues (HTTP is still 200).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['address'], properties: { address: { type: 'string' }, req_id: { type: 'string' } } },
              },
            },
          },
          responses: { '200': err('documented: quality, granularity_level, reason, formatted_address, corrections, request_id, req_id'), '400': err('Bad request') },
        },
      },
    },
  };
}
