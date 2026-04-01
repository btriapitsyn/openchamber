# Runtime Contracts Module Documentation

## Purpose
This module defines versioned runtime/provider/task/tool contract shapes used by OpenChamber backend runtimes as a shared source of truth before runtime host implementation details are introduced.

## Entrypoints and structure
- `packages/web/server/lib/runtime-contracts/index.js`: Contract version constants, runtime event envelope helpers, and provider capability negotiation logic.
- `packages/web/server/lib/runtime-contracts/index.d.ts`: Public type contracts for runtime host, task, execution, tool invocation, provider capabilities, and negotiation outcomes.
- `packages/web/server/lib/runtime-contracts/runtime-contracts.test.js`: Bun unit tests covering event/version and negotiation invariants.

## Versioning strategy
- Runtime contract version: `runtime.contract.v1`
- Runtime event version: `runtime.event.v1`
- `RuntimeEvent` is a discriminated union keyed by `type` with an explicit schema version field so downstream storage/event pipelines can evolve via additive `*.v2` contracts.

## Public contracts
- `AgentRuntimeHost`
- `TaskRecord`
- `AgentExecution`
- `ToolInvocationEnvelope`
- `RuntimeEvent`
- `ProviderAdapter`
- `ProviderCapabilityMatrix`
- `ProviderError`
- `CapabilityNegotiationResult`

## Provider capability negotiation
`negotiateProviderCapabilities(matrix)` returns exactly one outcome:
- `accept`: provider satisfies every required capability.
- `degrade`: missing capabilities are all marked degradable.
- `refuse`: at least one missing required capability is non-degradable.

This keeps fallback behavior explicit in type contracts instead of implicit in runtime host logic.
