/**
 * `@build-room/gateway-registry` — the gateway lifecycle vocabulary and its
 * pure projection reducer.
 *
 * Zero I/O and zero dependencies, enforced by `test/purity.test.ts`. It decides
 * what a log of lifecycle events means; the control plane decides what may be
 * appended to that log.
 */

export {
  EVENT_RESULTING_STATE,
  GATEWAY_EVENT_TYPES,
  GATEWAY_STATES,
  TERMINAL_GATEWAY_STATES,
  isGatewayEventType,
  isGatewayState,
  isTerminalGatewayState,
  type GatewayEventType,
  type GatewayState,
} from './vocabulary.js';

export {
  ENROLLMENT_SLOTS,
  MAX_ENROLLED_GATEWAYS,
  ProjectionOrderError,
  applyGatewayEvent,
  currentlyEnrolled,
  lowestFreeSlot,
  projectGatewayRegistry,
  type EnrollmentSlot,
  type GatewayProjectionRow,
  type GatewayRegistryEvent,
  type HostDescriptor,
} from './projection.js';
