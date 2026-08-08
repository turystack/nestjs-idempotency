/**
 * What a repeat of the same key returns.
 *
 * - `'replay'` — the first result is stored and returned again. An HTTP caller
 *   is waiting for a body, so it has to get the same one.
 * - `'skip'` — nothing is stored and the repeat resolves to `undefined`. A queue
 *   handler has no caller waiting; recording that the work happened is enough.
 */
export type IdempotencyMode = 'replay' | 'skip'

/** Resolves the idempotency key from the decorated method's arguments. */
export type IdempotencyKeyResolver<T extends unknown[] = unknown[]> =
	| string
	| ((args: T) => string | Promise<string>)

/** Options shared by {@link Idempotent} and {@link IdempotencyService.run}. */
export type IdempotencyOptions = {
	/**
	 * Behaviour on a repeat. Defaults to `'replay'`.
	 */
	mode?: IdempotencyMode
	/**
	 * How long the key is remembered, in **seconds**. Defaults to `86_400`
	 * (24h). Payments and webhooks usually want days, not minutes.
	 */
	ttl?: number
	/**
	 * How long a concurrent caller waits for the in-flight execution, in
	 * milliseconds. Defaults to `5_000`. Exceeding it fails rather than running
	 * the operation a second time.
	 */
	waitTimeout?: number
	/**
	 * How long the in-flight guard survives a crashed process, in milliseconds.
	 * Defaults to `30_000`.
	 *
	 * Deliberately unrelated to {@link IdempotencyOptions.ttl}: the key is
	 * remembered for a day, but a guard held that long would block every retry
	 * until it expired. It only has to outlast one execution.
	 */
	lockTtl?: number
}

/** Options for {@link IdempotencyModule.register}. */
export type IdempotencyModuleOptions = {
	/** Prefix for every stored key. Defaults to `'idempotency'`. */
	prefix?: string
	/** Default TTL in seconds, overridable per operation. Defaults to `86_400`. */
	ttl?: number
}

/** What is stored for a completed operation. */
export type IdempotencyRecord = {
	/**
	 * Fingerprint of the arguments the key was first used with. A second call
	 * carrying the same key but different arguments is a bug, not a retry.
	 */
	fingerprint: string
	/** Result of the first execution, when the mode stores it. */
	result?: unknown
}
