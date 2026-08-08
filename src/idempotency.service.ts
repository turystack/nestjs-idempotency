import { createHash } from 'node:crypto'

import { Inject, Injectable, Optional } from '@nestjs/common'
import { ConflictError } from '@turystack/exceptions'
import { CacheService } from '@turystack/nestjs-cache'
import { LockService } from '@turystack/nestjs-lock'

import {
	DEFAULT_LOCK_TTL,
	DEFAULT_PREFIX,
	DEFAULT_TTL,
	DEFAULT_WAIT_TIMEOUT,
	IDEMPOTENCY_MODULE_OPTIONS,
} from '@/idempotency.constants.js'
import type {
	IdempotencyModuleOptions,
	IdempotencyOptions,
	IdempotencyRecord,
} from '@/idempotency.types.js'

/**
 * Runs an operation at most once per key.
 *
 * @example
 * ```ts
 * await this.idempotency.run(
 *   `payment:${idempotencyKey}`,
 *   () => this.createPaymentUseCase.execute(input),
 *   { ttl: 86_400 },
 * )
 * ```
 */
@Injectable()
export class IdempotencyService {
	private readonly prefix: string
	private readonly defaultTtl: number

	constructor(
		// Injected by explicit token: a bare type annotation would be erased at
		// runtime by `import type`, and Nest could not resolve it.
		@Inject(CacheService)
		private readonly cache: CacheService,
		@Inject(LockService)
		private readonly lock: LockService,
		@Optional()
		@Inject(IDEMPOTENCY_MODULE_OPTIONS)
		options?: IdempotencyModuleOptions,
	) {
		this.prefix = options?.prefix ?? DEFAULT_PREFIX
		this.defaultTtl = options?.ttl ?? DEFAULT_TTL
	}

	/**
	 * A key is a promise that the same request produces the same effect. Reusing
	 * one with different arguments breaks that promise, so it is reported rather
	 * than silently serving the wrong stored result.
	 */
	private fingerprint(payload: unknown): string {
		return createHash('sha256')
			.update(JSON.stringify(payload ?? null))
			.digest('hex')
			.slice(0, 32)
	}

	private recordKey(key: string): string {
		return `${this.prefix}:${key}`
	}

	private assertSamePayload(
		key: string,
		record: IdempotencyRecord,
		fingerprint: string,
	): void {
		if (record.fingerprint === fingerprint) {
			return
		}

		throw new ConflictError(
			`Idempotency key "${key}" was already used with a different payload`,
			{
				idempotencyKey: key,
			},
		)
	}

	async run<T>(
		key: string,
		operation: () => Promise<T>,
		options: IdempotencyOptions & {
			payload?: unknown
		} = {},
	): Promise<T | undefined> {
		const mode = options.mode ?? 'replay'
		const ttl = options.ttl ?? this.defaultTtl
		const recordKey = this.recordKey(key)
		const fingerprint = this.fingerprint(options.payload)

		const existing = await this.cache.get<IdempotencyRecord>(recordKey)

		if (existing) {
			this.assertSamePayload(key, existing, fingerprint)
			return existing.result as T | undefined
		}

		const { unlock } = await this.lock.lock(recordKey, {
			ttl: options.lockTtl ?? DEFAULT_LOCK_TTL,
			waitTimeout: options.waitTimeout ?? DEFAULT_WAIT_TIMEOUT,
		})

		try {
			// Re-read under the lock: a concurrent caller may have finished while
			// this one waited, and running the operation again would defeat the key.
			const settled = await this.cache.get<IdempotencyRecord>(recordKey)

			if (settled) {
				this.assertSamePayload(key, settled, fingerprint)
				return settled.result as T | undefined
			}

			const result = await operation()

			await this.cache.set<IdempotencyRecord>(
				recordKey,
				{
					fingerprint,
					...(mode === 'replay' && {
						result,
					}),
				},
				{
					ttl,
				},
			)

			return result
		} finally {
			await unlock()
		}
	}
}
