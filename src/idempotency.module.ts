import type { DynamicModule } from '@nestjs/common'
import { ConfigService } from '@turystack/nestjs-config'

import {
	DEFAULT_PREFIX,
	DEFAULT_TTL,
	IDEMPOTENCY_MODULE_OPTIONS,
} from '@/idempotency.constants.js'
import { IdempotencyService } from '@/idempotency.service.js'
import type { IdempotencyModuleOptions } from '@/idempotency.types.js'

/**
 * Registers idempotency for the whole app.
 *
 * Requires `CacheModule` (storage) and `LockModule` (mutual exclusion while an
 * execution is in flight) to be registered at the root.
 *
 * Options accept a plain object or a `(config) => options` factory that
 * receives the `ConfigService` from `@turystack/nestjs-config` at boot
 * (requires `ConfigModule` to be registered).
 *
 * @example
 * ```ts
 * @Module({
 *   imports: [
 *     CacheModule.register({ adapter: 'redis', redis: { url } }),
 *     LockModule.register(),
 *     IdempotencyModule.register((config) => ({
 *       ttl: config.get('IDEMPOTENCY_TTL'),
 *     })),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
export class IdempotencyModule {
	static register(
		options:
			| IdempotencyModuleOptions
			| ((config: ConfigService) => IdempotencyModuleOptions) = {},
	): DynamicModule {
		return {
			exports: [
				IdempotencyService,
				IDEMPOTENCY_MODULE_OPTIONS,
			],
			global: true,
			module: IdempotencyModule,
			providers: [
				IdempotencyService,
				{
					inject: [
						{
							optional: true,
							token: ConfigService,
						},
					],
					provide: IDEMPOTENCY_MODULE_OPTIONS,
					useFactory: (config?: ConfigService) => {
						const resolved = IdempotencyModule._resolveOptions(options, config)

						return {
							prefix: resolved.prefix ?? DEFAULT_PREFIX,
							ttl: resolved.ttl ?? DEFAULT_TTL,
						} satisfies IdempotencyModuleOptions
					},
				},
			],
		}
	}

	private static _resolveOptions(
		optionsOrFactory:
			| IdempotencyModuleOptions
			| ((config: ConfigService) => IdempotencyModuleOptions),
		config?: ConfigService,
	): IdempotencyModuleOptions {
		if (typeof optionsOrFactory !== 'function') {
			return optionsOrFactory
		}

		if (!config) {
			throw new Error(
				'[IdempotencyModule] register((config) => ...) requires ConfigModule (@turystack/nestjs-config) to be registered',
			)
		}

		return optionsOrFactory(config)
	}
}
