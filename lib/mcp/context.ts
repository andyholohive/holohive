import { AsyncLocalStorage } from 'async_hooks';
import type { McpAuthContext } from './auth';

/**
 * Per-request auth context for MCP tool handlers.
 *
 * The MCP SDK doesn't pass the original Request through to tool callbacks —
 * once we authenticate the request and dispatch to the handler, tools can't
 * see who made the call. That's fine for read tools (we use the service
 * role anyway), but write tools need the user_id for owner attribution.
 *
 * AsyncLocalStorage is the Node-native way to stash per-request state. The
 * route wraps `handler(req)` in `mcpAuthStorage.run(ctx, ...)` so any tool
 * callback fired during that request can `mcpAuthStorage.getStore()` and
 * recover the user context without changing every tool signature.
 *
 * Returns undefined if called outside an MCP request — defensive for tests
 * or any other entry point.
 */
export const mcpAuthStorage = new AsyncLocalStorage<McpAuthContext>();
