/**
 * The Lane D pre-hook that quarantines pre-dispatch. A blocker, a
 * quarantined scope, or (by default) an unreviewed scope is a `block`, and
 * the Lane D interceptor never reaches the dispatcher for a blocked call.
 */

import type { PreHook, PreHookDecision, ToolCall } from '../../gateway-daemon/src/hooks/index.js';
import type { QuarantineAdvisor } from './advisor.js';

export function quarantinePreHook(advisor: QuarantineAdvisor, name = 'quarantine-advisor'): PreHook {
  return {
    name,
    run(call: ToolCall): PreHookDecision {
      return advisor.decide(call);
    },
  };
}
