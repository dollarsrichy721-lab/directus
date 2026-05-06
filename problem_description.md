# Request ID correlation for API logs and responses

## 1. Problem Brief

Directus API lacks a first-class request correlation ID, making it difficult to trace a single HTTP request across logs, reverse proxies, and error reports. Add a consistent request ID so every response exposes an identifier and every HTTP log line can be tied to the same request.

## 2. Requirements

Accept a client-provided `X-Request-Id` only when its length is <= 200 and it matches `^[A-Za-z0-9._-]+$`; otherwise generate a new ID with `nanoid()`. The request ID must be assigned and the `X-Request-Id` response header set **before** any auth, rate limit, routing, and request logging middleware executes.

### Logger Integration

Update `createExpressLogger` to set a `request_id` field via `customProps` equal to the response `X-Request-Id`.

## 3. Test Assumptions

Export `requestIdMiddleware` from `api/src/middleware/request-id.js`, `REQUEST_ID_HEADER` (= `'X-Request-Id'`) from `api/src/utils/request-id.js`, and update `createExpressLogger` in `api/src/logger/index.js` to set `request_id` via `pino-http` `customProps`.

The `requestIdMiddleware` must call `nanoid()` from the `nanoid` package during request handling (not during module import).
