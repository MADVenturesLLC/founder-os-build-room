/**
 * The one place the Gateway chooses its custody backend (Linux Gateway design
 * note §4.4; Founder act FOUNDER-ACT-20261012-BR-LINUX-GATEWAY-IMPLEMENTATION
 * B3.1).
 *
 * The switch is the operating system and nothing else: never a host's name or
 * user, and never an environment variable. There is no plaintext-file
 * fallback: a platform with no custody facility gets a backend whose every
 * operation fails `keychain_unavailable`, so `enroll` refuses and `doctor`
 * says why.
 */

import { join } from 'node:path';
import { Custody, SecurityCommandRunner, UnavailableCustody, type GatewayCustody } from './custody.js';
import type { GatewayPaths } from './paths.js';
import { SystemdCredsCommandRunner, SystemdCredsCustody } from './systemd-creds-custody.js';

/** The Linux custody directory: `<gateway directory>/custody`, mode 0700. */
export function custodyDirectory(paths: GatewayPaths): string {
  return join(paths.directory, 'custody');
}

export function defaultGatewayCustody(
  paths: GatewayPaths,
  platformName: NodeJS.Platform = process.platform,
): GatewayCustody {
  if (platformName === 'darwin') return new Custody(new SecurityCommandRunner());
  if (platformName === 'linux') {
    return new SystemdCredsCustody(new SystemdCredsCommandRunner(), custodyDirectory(paths));
  }
  return new UnavailableCustody(
    `no custody backend on ${platformName}: the Gateway supports macOS and Linux only`,
  );
}
