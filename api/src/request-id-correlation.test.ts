import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { useEnv } from '@directus/env';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createExpressLogger } from './logger/index.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { REQUEST_ID_HEADER } from './utils/request-id.js';

let seenHttpLogs: Array<Array<{ props: Record<string, any>; headerId: unknown }>> = [];
let order: Array<'request-id-set' | 'logger'> = [];

vi.mock('@directus/env', () => ({
	useEnv: vi.fn().mockReturnValue({
		LOG_STYLE: 'raw',
		WEBSOCKETS_LOGS_ENABLED: false,
	}),
}));

vi.mock('pino-http', () => {
	return {
		pinoHttp: vi.fn((options: any) => {
			return (req: any, res: any, next: any) => {
				order.push('logger');
				expect(res.getHeader(REQUEST_ID_HEADER)).toBeTruthy();

				const props = options?.customProps?.(req, res) ?? {};
				const requestIdFromHeader = res.getHeader(REQUEST_ID_HEADER);
				const log = { props, headerId: requestIdFromHeader };

				if (!req.__logs) {
					req.__logs = [];
					seenHttpLogs.push(req.__logs);
				}

				req.__logs.push(log);
				next();
			};
		}),
		stdSerializers: {
			req: (request: any) => ({ url: request?.url, method: request?.method, headers: request?.headers }),
		},
	};
});

const isAsciiSafeRequestId = (value: string) => {
	if (value.length === 0) return false;
	if (value.length > 200) return false;
	return /^[A-Za-z0-9._-]+$/.test(value);
};

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
	vi.mocked(useEnv).mockReturnValue({
		LOG_STYLE: 'raw',
		WEBSOCKETS_LOGS_ENABLED: false,
	});

	const app = express();

	app.use(requestIdMiddleware);
	app.use((_req, res, next) => {
		order.push('request-id-set');
		expect(res.getHeader(REQUEST_ID_HEADER)).toBeTruthy();
		next();
	});
	app.use(createExpressLogger());

	const mockAuth = vi.fn((_req: any, res: any, next: any) => {
		expect(res.getHeader(REQUEST_ID_HEADER)).toBeTruthy();
		next();
	});

	const mockRateLimiter = vi.fn((_req: any, res: any, next: any) => {
		expect(res.getHeader(REQUEST_ID_HEADER)).toBeTruthy();
		next();
	});

	app.use(mockRateLimiter);
	app.use(mockAuth);

	app.get('/__test__/ping', (_req, res) => {
		expect(res.getHeader(REQUEST_ID_HEADER)).toBeTruthy();
		res.status(200).send('pong');
	});

	app.get('/__test__/boom', () => {
		throw new Error('boom');
	});

	app.use((_req, res) => {
		res.status(404).send('Not Found');
	});

	server = http.createServer(app);
	await new Promise<void>((resolve) => server.listen(0, resolve));
	const address = server.address() as AddressInfo;
	baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
	server.close();
});

afterEach(() => {
	seenHttpLogs = [];
	order = [];
	vi.clearAllMocks();
});

const makeRequest = async (path: string, headers?: Record<string, string>) => {
	return await fetch(`${baseUrl}${path}`, {
		method: 'GET',
		...(headers ? { headers } : {}),
		redirect: 'manual',
	});
};

describe('Request correlation ID (X-Request-Id)', () => {
	test('should not execute request id logic at import time, but should execute on request start', async () => {
		vi.resetModules();

		const mockNanoid = vi.fn(() => 'generated_id_for_test');
		vi.doMock('nanoid', () => ({ nanoid: mockNanoid }));

		const { requestIdMiddleware: importedRequestIdMiddleware } = await import('./middleware/request-id.js');
		expect(mockNanoid).not.toHaveBeenCalled();

		const app = express();
		app.use(importedRequestIdMiddleware);
		app.get('/__test__/timing', (_req, res) => res.status(200).send('ok'));
		app.use((_req, res) => res.status(404).send('Not Found'));

		const server = http.createServer(app);
		await new Promise<void>((resolve) => server.listen(0, resolve));
		const address = server.address() as AddressInfo;
		const url = `http://127.0.0.1:${address.port}/__test__/timing`;

		try {
			const response = await fetch(url);
			expect(response.status).toBe(200);
			expect(response.headers.get('x-request-id')).toBeTruthy();
			expect(mockNanoid).toHaveBeenCalled();
		} finally {
			server.close();
			vi.doUnmock('nanoid');
		}
	});

	test('should include X-Request-Id on successful responses and correlate in logs', async () => {
		const response = await makeRequest('/__test__/ping');
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toBe('pong');

		const requestId = response.headers.get('x-request-id');
		expect(requestId).toBeTruthy();
		expect(isAsciiSafeRequestId(requestId!)).toBe(true);

		const logsForRequest = seenHttpLogs.at(-1) ?? [];
		expect(logsForRequest.length).toBeGreaterThan(0);
		expect(order).toEqual(['request-id-set', 'logger']);

		for (const log of logsForRequest) {
			expect(log.props['request_id']).toBe(requestId);
			expect(log.props['request_id']).toBe(log.headerId);
		}
	});

	test('should preserve valid client provided request id', async () => {
		const clientRequestId = 'client_abc-123.ZZ';
		const response = await makeRequest('/__test__/ping', { [REQUEST_ID_HEADER]: clientRequestId });
		expect(response.status).toBe(200);
		expect(response.headers.get('x-request-id')).toBe(clientRequestId);
	});

	test('should accept client provided request id with length 200', async () => {
		const clientRequestId = 'a'.repeat(200);
		const response = await makeRequest('/__test__/ping', { [REQUEST_ID_HEADER]: clientRequestId });
		expect(response.status).toBe(200);
		expect(response.headers.get('x-request-id')).toBe(clientRequestId);
	});

	test('should replace invalid client provided request ids', async () => {
		const invalidIds = ['', 'a'.repeat(201), 'invalid space', 'bad@id'];

		for (const invalidId of invalidIds) {
			const response = await makeRequest('/__test__/ping', { [REQUEST_ID_HEADER]: invalidId });
			const requestId = response.headers.get('x-request-id');
			expect(requestId).toBeTruthy();
			expect(isAsciiSafeRequestId(requestId!)).toBe(true);
			expect(requestId).not.toBe(invalidId);
		}
	});

	test('should include X-Request-Id on errors', async () => {
		const response = await makeRequest('/__test__/boom');
		expect(response.status).toBeGreaterThanOrEqual(500);
		expect(response.status).toBeLessThan(600);

		const requestId = response.headers.get('x-request-id');
		expect(requestId).toBeTruthy();
		expect(isAsciiSafeRequestId(requestId!)).toBe(true);
	});

	test('should not change request id after headers are sent', async () => {
		let initialHeaderValue: string | undefined;
		let mutationAttempted = false;
		let mutationThrew = false;

		const app = express();
		app.use(requestIdMiddleware);
		app.get('/__test__/terminal', (_req, res) => {
			initialHeaderValue = String(res.getHeader(REQUEST_ID_HEADER) ?? '');
			res.writeHead(200);

			mutationAttempted = true;
			try {
				res.setHeader(REQUEST_ID_HEADER, 'should-not-apply');
			} catch {
				mutationThrew = true;
			}

			res.end('ok');
		});
		app.use((_req, res) => res.status(404).send('Not Found'));

		const server = http.createServer(app);
		await new Promise<void>((resolve) => server.listen(0, resolve));
		const address = server.address() as AddressInfo;
		const url = `http://127.0.0.1:${address.port}/__test__/terminal`;

		try {
			const response = await fetch(url);
			expect(response.status).toBe(200);
			const finalHeader = response.headers.get('x-request-id');
			expect(finalHeader).toBeTruthy();
			expect(initialHeaderValue).toBeTruthy();
			expect(finalHeader).toBe(initialHeaderValue);
			expect(mutationAttempted).toBe(true);
			expect(mutationThrew).toBe(true);
		} finally {
			server.close();
		}
	});

	test('should include X-Request-Id on not found responses', async () => {
		const response = await makeRequest('/does-not-exist');
		expect(response.status).toBe(404);
		expect(response.headers.get('x-request-id')).toBeTruthy();
	});

	test('should generate unique request IDs for concurrent requests', async () => {
		const responses = await Promise.all([
			makeRequest('/__test__/ping'),
			makeRequest('/__test__/ping'),
			makeRequest('/__test__/ping'),
			makeRequest('/__test__/ping'),
		]);

		const ids = responses.map((r) => r.headers.get('x-request-id'));

		for (const id of ids) {
			expect(id).toBeTruthy();
			expect(isAsciiSafeRequestId(id!)).toBe(true);
		}

		const unique = new Set(ids);
		expect(unique.size).toBe(ids.length);
	});
});
