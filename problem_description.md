# Request ID correlation for API logs and responses

## 1. Problem Brief
Directus API lacks a first-class request correlation ID, making it difficult to trace a single HTTP request across logs, reverse proxies, and error reports. Add a consistent request ID so every response exposes an identifier and every HTTP log line can be tied to the same request.

## 2. Requirements

- Accept a client-provided `X-Request-Id` only if it is:
	- non-empty
	- length <= 200 characters
	- matches `^[A-Za-z0-9._-]+$`
- Otherwise generate a new ID that also matches `^[A-Za-z0-9._-]+$`.
- The request ID must be assigned and the response `X-Request-Id` header must be set **before** any auth, rate limit, routing, and request logging middleware executes.
- Always set `X-Request-Id` on the response (including error responses such as 4xx/5xx).
- Terminal state: once response headers are sent, the request ID must not change.
- Validation timing: header validation must happen at request start (not at import time).

### Logger Integration
- Every HTTP log entry must include a `request_id` field whose value equals the effective `X-Request-Id` for that request.

## 3. Test Assumptions

### Test Assumptions

Implementations must provide the following public interfaces:

- Export a named `requestIdMiddleware` from:
  `api/src/middleware/request-id.js` 
  - This middleware must:
    - resolve and validate/generate the request ID
    - set the `X-Request-Id` response header
    - generate new IDs using the `nanoid()` function from the `nanoid` 
      package, called during request handling (not at module import time)

- Export a named `createExpressLogger` from:
  `api/src/logger/index.js` 
  - Must return an Express middleware built using `pino-http` 
  - Must set a `request_id` field via `customProps` 

- Export a named constant `REQUEST_ID_HEADER` from:
  `api/src/utils/request-id.js` 
  - Value must be `'X-Request-Id'`
