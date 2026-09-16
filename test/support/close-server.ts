import type { Server } from 'node:http';

/**
 * `server.close()` alone waits for every keep-alive socket to end on its
 * own — several real seconds per test, left to Node's and the client's
 * idle timeouts. `closeAllConnections()` destroys every socket
 * immediately, including one still mid-request, so callers MUST await
 * their last response before calling this. `closeIdleConnections()`
 * looked like the more conservative choice (it leaves an in-flight
 * socket alone) but proved unreliable in practice: repeated local runs
 * still saw multi-second hangs with it in place.
 */
export function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      // A double close() is a harmless no-op, matching the prior
      // always-resolves behavior; anything else is a real failure the
      // caller should see rather than have silently swallowed.
      if (error != null && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
        reject(error);
        return;
      }
      resolve();
    });
    server.closeAllConnections();
  });
}
