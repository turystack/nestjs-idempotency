# @turystack/nestjs-idempotency

Idempotency keys for repeatable requests and redeliverable events, built on @turystack/nestjs-cache storage and @turystack/nestjs-lock mutual exclusion.

## Installation

```bash
pnpm add @turystack/nestjs-idempotency
```

### Peer dependencies

The host application provides these:

```bash
pnpm add @nestjs/common @nestjs/core @turystack/exceptions @turystack/nestjs-cache @turystack/nestjs-config @turystack/nestjs-lock reflect-metadata
```

## Documentation

Options, API reference and examples:

**https://tury.dev/libs/nestjs-idempotency**

## Development

```bash
pnpm install
pnpm typecheck
pnpm check
pnpm test
pnpm build
```
