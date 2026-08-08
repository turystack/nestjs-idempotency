import { Test } from '@nestjs/testing'
import { ConflictError } from '@turystack/exceptions'
import { CacheService } from '@turystack/nestjs-cache'
import { LockService } from '@turystack/nestjs-lock'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IDEMPOTENCY_MODULE_OPTIONS } from '@/idempotency.constants.js'
import { IdempotencyService } from '@/idempotency.service.js'
import type { IdempotencyRecord } from '@/idempotency.types.js'

/** In-memory stand-in for the cache, so a stored record is really read back. */
function createCache() {
	const store = new Map<string, unknown>()

	return {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		set: vi.fn(async (key: string, value: unknown) => {
			store.set(key, value)
			return true
		}),
		store,
	}
}

async function createService(cache: ReturnType<typeof createCache>) {
	const unlock = vi.fn(async () => undefined)
	const lock = vi.fn(async () => ({
		unlock,
	}))

	const moduleRef = await Test.createTestingModule({
		providers: [
			IdempotencyService,
			{
				provide: CacheService,
				useValue: cache,
			},
			{
				provide: LockService,
				useValue: {
					lock,
				},
			},
			{
				provide: IDEMPOTENCY_MODULE_OPTIONS,
				useValue: {
					prefix: 'idempotency',
					ttl: 3_600,
				},
			},
		],
	}).compile()

	return {
		lock,
		service: moduleRef.get<IdempotencyService>(IdempotencyService),
		unlock,
	}
}

describe('IdempotencyService', () => {
	let cache: ReturnType<typeof createCache>

	beforeEach(() => {
		cache = createCache()
	})

	it('runs the operation on the first call', async () => {
		const { service } = await createService(cache)
		const operation = vi.fn(async () => 'charged')

		await expect(service.run('pay-1', operation)).resolves.toBe('charged')
		expect(operation).toHaveBeenCalledTimes(1)
	})

	it('replays the stored result without running again', async () => {
		const { service } = await createService(cache)
		const operation = vi.fn(async () => 'charged')

		await service.run('pay-1', operation)
		await expect(service.run('pay-1', operation)).resolves.toBe('charged')

		expect(operation).toHaveBeenCalledTimes(1)
	})

	it('skips without storing a result when the caller is not waiting for one', async () => {
		const { service } = await createService(cache)
		const operation = vi.fn(async () => 'processed')

		await service.run('evt-1', operation, {
			mode: 'skip',
		})

		await expect(
			service.run('evt-1', operation, {
				mode: 'skip',
			}),
		).resolves.toBeUndefined()
		expect(operation).toHaveBeenCalledTimes(1)

		const stored = cache.store.get('idempotency:evt-1') as IdempotencyRecord
		expect(stored.result).toBeUndefined()
	})

	it('rejects the same key used with a different payload', async () => {
		const { service } = await createService(cache)

		await service.run('pay-1', async () => 'charged', {
			payload: {
				amount: 100,
			},
		})

		await expect(
			service.run('pay-1', async () => 'charged', {
				payload: {
					amount: 999,
				},
			}),
		).rejects.toBeInstanceOf(ConflictError)
	})

	it('accepts the same key with the same payload', async () => {
		const { service } = await createService(cache)

		await service.run('pay-1', async () => 'charged', {
			payload: {
				amount: 100,
			},
		})

		await expect(
			service.run('pay-1', async () => 'charged', {
				payload: {
					amount: 100,
				},
			}),
		).resolves.toBe('charged')
	})

	it('holds the in-flight guard for a bounded time, not the whole key window', async () => {
		const { lock, service } = await createService(cache)

		await service.run('pay-1', async () => 'charged', {
			ttl: 604_800,
		})

		// A guard held for the 7-day key window would block every retry until it
		// expired; it only has to outlast one execution.
		expect(lock).toHaveBeenCalledWith(
			'idempotency:pay-1',
			expect.objectContaining({
				ttl: 30_000,
			}),
		)
	})

	it('releases the guard even when the operation throws', async () => {
		const { service, unlock } = await createService(cache)

		await expect(
			service.run('pay-1', async () => {
				throw new Error('gateway down')
			}),
		).rejects.toThrow('gateway down')

		expect(unlock).toHaveBeenCalledTimes(1)
	})

	it('does not remember a failed operation', async () => {
		const { service } = await createService(cache)
		const operation = vi
			.fn(async () => 'charged')
			.mockRejectedValueOnce(new Error('gateway down'))

		await expect(service.run('pay-1', operation)).rejects.toThrow(
			'gateway down',
		)
		await expect(service.run('pay-1', operation)).resolves.toBe('charged')

		expect(operation).toHaveBeenCalledTimes(2)
	})

	it('re-reads under the guard, so a caller that waited does not run it again', async () => {
		const { lock, service, unlock } = await createService(cache)
		const operation = vi.fn(async () => 'charged')

		// Learn what a real record for this payload looks like, so the replay is
		// checked against a matching fingerprint rather than a hand-written one.
		await service.run('probe', async () => 'probe', {
			payload: undefined,
		})
		const template = cache.store.get('idempotency:probe') as IdempotencyRecord

		// The concurrent caller finishes while this one is waiting on the guard.
		lock.mockImplementationOnce(async () => {
			cache.store.set('idempotency:pay-1', {
				fingerprint: template.fingerprint,
				result: 'charged by the other caller',
			})

			return {
				unlock,
			}
		})

		await expect(
			service.run('pay-1', operation, {
				payload: undefined,
			}),
		).resolves.toBe('charged by the other caller')
		expect(operation).not.toHaveBeenCalled()
	})
})
