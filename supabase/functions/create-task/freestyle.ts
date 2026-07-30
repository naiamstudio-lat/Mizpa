/**
 * Backward-compatible re-exports from the centralized VM client
 *
 * Keeps `create-task/index.ts` working without changes by re-exporting
 * all symbols from the shared client at `_shared/vm-client.ts`.
 */
export * from "../_shared/vm-client.ts"
