## Context

Next.js type generation caused TypeScript to write per-application incremental metadata into the source tree.

## Goals / Non-Goals

**Goals:** keep verification runs from dirtying Git state.

**Non-Goals:** change compiler incrementality or application behavior.

## Decisions

Delete the generated files and ignore the extension globally. Disabling incremental compilation was rejected because the cache remains useful locally.

## Risks / Trade-offs

- [Stale local metadata remains] -> It is ignored and can be regenerated or removed locally without affecting the repository.
