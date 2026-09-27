## Why

TypeScript incremental metadata was accidentally committed by the foundation build and is modified by every verification run.

## What Changes

- Remove tracked `tsconfig.tsbuildinfo` files.
- Ignore all future TypeScript incremental metadata.

## Capabilities

### New Capabilities

None. This change opts out of specs because it only removes generated build artifacts.

### Modified Capabilities

None.

## Impact

Repository hygiene only; runtime behavior is unchanged.
