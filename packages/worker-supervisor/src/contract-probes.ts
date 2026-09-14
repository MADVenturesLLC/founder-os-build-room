/**
 * Default readiness probes for the worker-supervisor contract.
 *
 * `tcpPortProbe` CONNECTS to a loopback port and reports whether the
 * connection was accepted; it never listens. `regexLogProbe` compiles the
 * spec's pattern once and reports whether a line matches. Both are
 * injectable into the stub, so its suite runs without a real process; the
 * probes themselves are proven against a loopback fixture in the suite.
 */

import { createConnection } from 'node:net';
import type { LogReadinessSpec, TcpReadinessSpec } from './contract.js';

export type TcpProbe = (spec: TcpReadinessSpec) => Promise<boolean>;
export type LogProbe = (line: string) => boolean;

export const tcpPortProbe: TcpProbe = (spec) =>
  new Promise((resolve) => {
    let settled = false;
    const done = (accepting: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(accepting);
    };
    const socket = createConnection({ host: spec.host, port: spec.port });
    socket.setTimeout(spec.connectTimeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });

export function regexLogProbe(spec: LogReadinessSpec): LogProbe {
  const flags = `${(spec.flags ?? '').replace(/[gu]/g, '')}u`;
  const pattern = new RegExp(spec.pattern, flags);
  return (line) => pattern.test(line);
}
