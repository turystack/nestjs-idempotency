import { describe, expect, it, vi } from 'vitest'

import type { IdempotencyService } from '@/idempotency.service.js'
import { Idempotent } from '@/idempotent.decorator.js'

/** Stand-in that actually runs the operation once per key, like the real one. */
function createIdempotency() {
	const seen = new Map<string, unknown>()

	return {
		calls: [] as {
			key: string
			options: unknown
		}[],
		run: vi.fn(async function (
			this: unknown,
			key: string,
			operation: () => Promise<unknown>,
			options: unknown,
		) {
			if (seen.has(key)) {
				return seen.get(key)
			}

			const result = await operation()
			seen.set(key, result)

			return result
		}),
	}
}

describe('Idempotent', () => {
	it('resolves the key from the method arguments', async () => {
		const idempotency = createIdempotency()

		class Handler {
			idempotency = idempotency as unknown as IdempotencyService

			@Idempotent(
				([event]: [
					{
						identifier: string
					},
				]) => `evt:${event.identifier}`,
			)
			async execute(_event: { identifier: string }) {
				return 'processed'
			}
		}

		await new Handler().execute({
			identifier: 'abc',
		})

		expect(idempotency.run).toHaveBeenCalledWith(
			'evt:abc',
			expect.any(Function),
			expect.objectContaining({
				payload: [
					{
						identifier: 'abc',
					},
				],
			}),
		)
	})

	it('accepts a static key', async () => {
		const idempotency = createIdempotency()

		class Job {
			idempotency = idempotency as unknown as IdempotencyService

			@Idempotent('nightly-close')
			async execute() {
				return 'closed'
			}
		}

		await new Job().execute()

		expect(idempotency.run).toHaveBeenCalledWith(
			'nightly-close',
			expect.any(Function),
			expect.anything(),
		)
	})

	it('runs the body once across repeats', async () => {
		const idempotency = createIdempotency()
		const body = vi.fn()

		class Handler {
			idempotency = idempotency as unknown as IdempotencyService

			@Idempotent(
				([id]: [
					string,
				]) => `order:${id}`,
			)
			async execute(_id: string) {
				body()
				return 'processed'
			}
		}

		const handler = new Handler()
		await handler.execute('o1')
		await expect(handler.execute('o1')).resolves.toBe('processed')

		expect(body).toHaveBeenCalledTimes(1)
	})

	it('treats a different key as a different operation', async () => {
		const idempotency = createIdempotency()
		const body = vi.fn()

		class Handler {
			idempotency = idempotency as unknown as IdempotencyService

			@Idempotent(
				([id]: [
					string,
				]) => `order:${id}`,
			)
			async execute(_id: string) {
				body()
				return 'processed'
			}
		}

		const handler = new Handler()
		await handler.execute('o1')
		await handler.execute('o2')

		expect(body).toHaveBeenCalledTimes(2)
	})

	it('forwards the declared options', async () => {
		const idempotency = createIdempotency()

		class Handler {
			idempotencyService = idempotency as unknown as IdempotencyService

			@Idempotent('k', {
				mode: 'skip',
				ttl: 604_800,
			})
			async execute() {
				return 'processed'
			}
		}

		await new Handler().execute()

		expect(idempotency.run).toHaveBeenCalledWith(
			'k',
			expect.any(Function),
			expect.objectContaining({
				mode: 'skip',
				ttl: 604_800,
			}),
		)
	})

	it('fails with a readable message when the service was not injected', async () => {
		class Handler {
			@Idempotent('k')
			async execute() {
				return 'processed'
			}
		}

		await expect(new Handler().execute()).rejects.toThrow(
			'requires IdempotencyService injected',
		)
	})
})
