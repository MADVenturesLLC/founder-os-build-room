/**
 * The restart script's one decision: which deployment is the current one.
 *
 * `scripts/railway-restart.sh` performs the restart that Phase 2's
 * `survives_restart` condition is judged from, and everything it does hangs on
 * picking the right deployment id. That choice used to be inline in a shell
 * script nothing exercised, so the only evidence it was right was that it had
 * not visibly been wrong.
 *
 * It is now `scripts/select-newest-deployment.sh`, driven here with real
 * responses. The boundary is the whole subject: Railway documents no ordering
 * guarantee for `deployments`, so sorting a page by `createdAt` is exact only
 * if the page CONTAINS the newest deployment. A page that came back full may
 * be truncated, and then it does not establish anything — so a full page is
 * refused and a short page is trusted. 49 and 50 against a page size of 50 are
 * therefore the two cases that matter, and both are pinned below
 * (Founder ruling, 2026-08-21: preserve tests for 49 and 50 results).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SELECT = join(REPO_ROOT, 'scripts', 'select-newest-deployment.sh');

const PAGE_SIZE = 50;

/**
 * `count` deployments in DELIBERATELY SHUFFLED order, so a test can only pass
 * by sorting. Returning them newest-first — which Railway was observed to do
 * on 2026-08-18 — would let a "take the first edge" implementation pass, and
 * that observed behaviour is exactly what this script must not depend on.
 */
function response(count: number): string {
  const nodes = Array.from({ length: count }, (_, i) => ({
    node: {
      id: `deployment-${i}`,
      status: 'SUCCESS',
      // Minute 0 upward, so `deployment-${count - 1}` is always the newest.
      createdAt: `2026-08-21T00:${String(i).padStart(2, '0')}:00.000Z`,
    },
  }));

  /*
   * A fixed, order-destroying permutation — evens ascending, then odds
   * descending. Not random: a test that fails one run in ten is worse than no
   * test. It puts the newest in the MIDDLE, so neither "take the first edge"
   * nor "take the last edge" passes; only a sort does.
   */
  const shuffled = [...nodes.filter((_, i) => i % 2 === 0), ...nodes.filter((_, i) => i % 2 === 1).reverse()];

  return JSON.stringify({ data: { deployments: { edges: shuffled } } });
}

function select(body: string, pageSize: number = PAGE_SIZE) {
  return spawnSync('bash', [SELECT, String(pageSize)], { input: body, encoding: 'utf8' });
}

describe('railway restart — the deployment page is either complete or refused', () => {
  it('selects the newest of 49, which is one short of a full page', () => {
    const result = select(response(49));

    assert.equal(result.status, 0, result.stderr);
    const newest = JSON.parse(result.stdout) as { id: string; createdAt: string };
    assert.equal(newest.id, 'deployment-48');
    assert.equal(newest.createdAt, '2026-08-21T00:48:00.000Z');
  });

  it('refuses a full page of 50 rather than restarting a deployment it cannot identify', () => {
    /*
     * The newest IS in this response — `deployment-49`, and a sort would find
     * it. That is not the point. A response carrying exactly as many edges as
     * were asked for cannot be distinguished from a truncated one, so the
     * script does not know whether it holds the newest, and acting on a set it
     * cannot prove is complete is the failure this refusal exists to prevent.
     */
    const result = select(response(50));

    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /full page of 50 deployments/);
    assert.match(result.stderr, /refusing to restart/);
  });

  it('refuses anything above a full page too, not only exact equality', () => {
    // `>= page_size`, not `== page_size`. A server that over-delivers is still
    // a server whose ordering is undocumented.
    const result = select(response(51));

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /full page of 51 deployments/);
  });

  it('sorts rather than trusting the order the server returned', () => {
    /*
     * The fixture is shuffled, and its FIRST edge is deliberately not the
     * newest. Railway was observed returning newest-first on 2026-08-18, which
     * made the original `first:1` accidentally correct; nothing about this
     * selection may depend on that observation holding.
     */
    const body = response(10);
    const edges = (JSON.parse(body) as { data: { deployments: { edges: { node: { id: string } }[] } } })
      .data.deployments.edges;
    assert.notEqual(edges[0]?.node.id, 'deployment-9', 'the newest must not be the first edge');
    assert.notEqual(edges[edges.length - 1]?.node.id, 'deployment-9', 'nor the last');

    const result = select(body);
    assert.equal(result.status, 0, result.stderr);
    assert.equal((JSON.parse(result.stdout) as { id: string }).id, 'deployment-9');
  });

  it('fails rather than returning nothing when the service has no deployments', () => {
    const result = select(JSON.stringify({ data: { deployments: { edges: [] } } }));

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no deployment found/);
  });

  it('distinguishes an empty result from a truncated one by exit code', () => {
    // Two different failures; an operator reading only the exit code should be
    // able to tell "nothing is deployed" from "I cannot prove which is newest".
    const empty = select(JSON.stringify({ data: { deployments: { edges: [] } } }));
    const truncated = select(response(50));

    assert.notEqual(empty.status, truncated.status);
  });
});
