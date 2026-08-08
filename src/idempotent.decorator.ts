import type { IdempotencyService } from '@/idempotency.service.js'
import type {
	IdempotencyKeyResolver,
	IdempotencyOptions,
} from '@/idempotency.types.js'

type Host = {
	idempotency?: IdempotencyService
	idempotencyService?: IdempotencyService
}

function resolveService(host: Host, method: string): IdempotencyService {
	const service = host.idempotency ?? host.idempotencyService

	if (!service) {
		throw new Error(
			`[Idempotent] ${method} requires IdempotencyService injected as "idempotency" or "idempotencyService"`,
		)
	}

	return service
}

/**
 * Runs the decorated method at most once per resolved key.
 *
 * A repeat returns the stored result (`mode: 'replay'`, the default) or
 * `undefined` (`mode: 'skip'`) without executing again.
 *
 * @example
 * ```ts
 * // HTTP — the client sends Idempotency-Key and waits for a body
 * @Idempotent(([{ headers }]) => `payment:${headers['idempotency-key']}`)
 * createPayment(@Request() { body, headers }) { ... }
 *
 * // Queue handler — dedup by the event's own stable identifier
 * @Idempotent(([event]) => `payment:${event.identifier}`, { mode: 'skip' })
 * async execute(event: PaymentRequested) { ... }
 * ```
 */
export function Idempotent<T extends unknown[] = unknown[]>(
	key: IdempotencyKeyResolver<T>,
	options: IdempotencyOptions = {},
) {
	return (
		_target: object,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor,
	): PropertyDescriptor => {
		const original = descriptor.value as (
			...args: unknown[]
		) => Promise<unknown>

		descriptor.value = async function (this: Host, ...args: unknown[]) {
			const service = resolveService(this, String(propertyKey))
			const resolved = typeof key === 'function' ? await key(args as T) : key

			return service.run(resolved, () => original.apply(this, args), {
				...options,
				payload: args,
			})
		}

		return descriptor
	}
}
