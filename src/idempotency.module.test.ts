import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { CacheService } from '@turystack/nestjs-cache'
import { ConfigModule, defineConfigSchema } from '@turystack/nestjs-config'
import { LockService } from '@turystack/nestjs-lock'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { IDEMPOTENCY_MODULE_OPTIONS } from '@/idempotency.constants.js'
import { IdempotencyModule } from '@/idempotency.module.js'
import type { IdempotencyModuleOptions } from '@/idempotency.types.js'

const schema = defineConfigSchema({
	IDEMPOTENCY_TTL: z.coerce.number(),
})

/**
 * Stands in for CacheModule and LockModule. Global because the real ones are:
 * providers declared on the testing module are not visible inside
 * IdempotencyModule.
 */
@Global()
@Module({
	exports: [
		CacheService,
		LockService,
	],
	providers: [
		{
			provide: CacheService,
			useValue: {
				get: vi.fn(),
				set: vi.fn(),
			},
		},
		{
			provide: LockService,
			useValue: {
				lock: vi.fn(),
			},
		},
	],
})
class BackingModule {}

afterEach(() => {
	vi.unstubAllEnvs()
})

function optionsOf(moduleRef: {
	get: <T>(token: symbol) => T
}): IdempotencyModuleOptions {
	return moduleRef.get<IdempotencyModuleOptions>(IDEMPOTENCY_MODULE_OPTIONS)
}

describe('IdempotencyModule.register', () => {
	it('applies the defaults with no options', async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [
				BackingModule,
				IdempotencyModule.register(),
			],
		}).compile()

		expect(optionsOf(moduleRef)).toEqual({
			prefix: 'idempotency',
			ttl: 86_400,
		})
	})

	it('accepts a plain options object', async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [
				BackingModule,
				IdempotencyModule.register({
					ttl: 604_800,
				}),
			],
		}).compile()

		expect(optionsOf(moduleRef).ttl).toBe(604_800)
	})

	it('accepts a (config) => options factory, like every other module', async () => {
		vi.stubEnv('IDEMPOTENCY_TTL', '604800')

		const moduleRef = await Test.createTestingModule({
			imports: [
				BackingModule,
				ConfigModule.register({
					schema,
				}),
				IdempotencyModule.register((config) => ({
					ttl: config.get('IDEMPOTENCY_TTL') as number,
				})),
			],
		}).compile()

		expect(optionsOf(moduleRef).ttl).toBe(604_800)
	})

	it('says what is missing when the factory form has no ConfigModule', async () => {
		await expect(
			Test.createTestingModule({
				imports: [
					BackingModule,
					IdempotencyModule.register(() => ({
						ttl: 1,
					})),
				],
			}).compile(),
		).rejects.toThrow('requires ConfigModule')
	})

	it('is global, so consumers do not import it everywhere', () => {
		expect(IdempotencyModule.register().global).toBe(true)
	})
})
