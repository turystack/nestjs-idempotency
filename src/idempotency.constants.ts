/** DI token for the resolved {@link IdempotencyModuleOptions}. */
export const IDEMPOTENCY_MODULE_OPTIONS = Symbol('IDEMPOTENCY_MODULE_OPTIONS')

/** Prefix for every stored idempotency key. */
export const DEFAULT_PREFIX = 'idempotency'

/** How long a key is remembered, in seconds. */
export const DEFAULT_TTL = 86_400

/** How long a concurrent caller waits for the in-flight execution, in ms. */
export const DEFAULT_WAIT_TIMEOUT = 5_000

/**
 * How long the in-flight guard survives a crashed process, in ms.
 *
 * Unrelated to {@link DEFAULT_TTL}: a guard held for the whole idempotency
 * window would block every retry until it expired.
 */
export const DEFAULT_LOCK_TTL = 30_000
