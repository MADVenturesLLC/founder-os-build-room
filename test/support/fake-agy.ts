/**
 * A fake agy for the executor suite — the Phase 4 authorization §6 allows
 * "fixtures and synthetic provider behavior required for deterministic
 * testing". It contacts nothing. It is started exactly as the executor
 * starts agy, `sudo -n -u <user> -- <agy> <pinned arguments>`, with the test
 * standing in for `sudo`, so the whole command line reaches it.
 *
 * It writes what it saw (its arguments after `--`, its working directory,
 * everything read from standard input) to `FAKE_AGY_LOG`, and behaves as
 * `FAKE_AGY_MODE` says:
 *
 *   ok            init on start; after one input line, a step and a SUCCESS
 *                 result whose response is `FAKE_AGY_PLAN`
 *   fenced        as ok, the response wrapped in a ```json fence
 *   wrong_model   init naming gemini-3.8-flash-high
 *   auto          init naming auto
 *   not_init      a first line that is not the init event
 *   garbage       a first line that is not JSON
 *   stdin_first   no init until an input line arrives (agy reading the work first)
 *   switch        as ok, but a step names another model
 *   error         init, then a result with status ERROR
 *   unparseable   as ok, the response not JSON
 *   hang          init, then silence after the input line
 *   exit          init, then exit 0 after the input line with no result
 *
 * Whatever the mode, it first enforces what agy 1.4.7 does, as the Founder
 * read it on the PC on 2026-10-26: `--print` must carry a value and refuses
 * a flag as one; stream-json input needs stream-json output; and an input
 * line must be `{"event":"user","message":{...}}`. A line without `event`,
 * or a `user` line without an object `message`, ends the run with an ERROR
 * result; an unknown event is ignored with a warning.
 */

import { appendFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const mode = process.env['FAKE_AGY_MODE'] ?? 'ok';
const logPath = process.env['FAKE_AGY_LOG'];
const plan = process.env['FAKE_AGY_PLAN'] ?? '{}';
const separator = process.argv.indexOf('--');
const after = separator === -1 ? process.argv.slice(2) : process.argv.slice(separator + 1);

if (logPath !== undefined) {
  writeFileSync(logPath, `${JSON.stringify({ argv: after, cwd: process.cwd() })}\n`);
}

// agy's own argument rules, before anything else.
for (const flag of ['--print', '-p', '--prompt']) {
  const at = after.indexOf(flag);
  if (at === -1) continue;
  const value = after[at + 1];
  if (value === undefined) {
    process.stderr.write(`flag needs an argument: -${flag.replace(/^-+/, '')}\n`);
    process.exit(2);
  }
  if (value.startsWith('-')) {
    process.stdout.write(`Error: ${flag} took "${value}" as its prompt, so the intended prompt was left as an argument and ignored.\n`);
    process.exit(2);
  }
}
const valueOf = (flag: string): string | undefined => {
  const at = after.indexOf(flag);
  return at === -1 ? undefined : after[at + 1];
};
if (valueOf('--input-format') === 'stream-json' && valueOf('--output-format') !== 'stream-json') {
  process.stderr.write('--input-format stream-json requires --output-format stream-json\n');
  process.exit(2);
}

const conversation = '3b2c7a4c-1bda-46b1-8dc1-44641701df02';
const emit = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
};
const init = (model: string): void =>
  emit({
    event: 'init',
    conversation_id: conversation,
    init: { model, cwd: process.cwd(), tools: ['view_file', 'run_command'], permission_mode: 'always-proceed' },
  });
const result = (response: string, status = 'SUCCESS'): void =>
  emit({ event: 'result', result: { conversation_id: conversation, status, response, num_turns: 1 } });
const refuse = (error: string): never => {
  process.stderr.write(`error: ${error}\n`);
  emit({ event: 'result', result: { conversation_id: conversation, status: 'ERROR', response: '', error, num_turns: 0 } });
  process.exit(1);
};

/** agy's stream input rules: `true` when the line is a user turn to answer. */
function acceptInput(line: string): boolean {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return refuse('failed to decode stream input');
  }
  const record = (value ?? {}) as Record<string, unknown>;
  if (typeof record['event'] !== 'string') return refuse('stream input message is missing the "event" field');
  if (record['event'] !== 'user') {
    process.stderr.write(`warning: ignoring unsupported stream input message event "${record['event']}"\n`);
    return false;
  }
  const message = record['message'];
  if (message === undefined) return refuse('stream input "user" message is missing the "message" field');
  if (message === null || typeof message !== 'object') return refuse('failed to decode stream input: message is not an object');
  return true;
}

if (mode === 'ok' || mode === 'fenced' || mode === 'switch' || mode === 'error' || mode === 'unparseable' || mode === 'hang' || mode === 'exit') {
  init('gemini-4-argon-high');
} else if (mode === 'wrong_model') {
  init('gemini-3.8-flash-high');
} else if (mode === 'auto') {
  init('auto');
} else if (mode === 'not_init') {
  emit({ event: 'step_update', step_update: { conversation_id: conversation, state: 'RUNNING' } });
} else if (mode === 'garbage') {
  process.stdout.write('not json\n');
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let answered = false;
lines.on('line', (line) => {
  if (logPath !== undefined) appendFileSync(logPath, `${JSON.stringify({ stdin: line })}\n`);
  if (answered || !acceptInput(line)) return;
  answered = true;
  switch (mode) {
    case 'stdin_first':
      init('gemini-4-argon-high');
      result(plan);
      break;
    case 'ok':
      emit({ event: 'step_update', step_update: { conversation_id: conversation, state: 'DONE', text_delta: '…' } });
      result(plan);
      break;
    case 'fenced':
      result(`\`\`\`json\n${plan}\n\`\`\``);
      break;
    case 'switch':
      emit({ event: 'step_update', step_update: { conversation_id: conversation, model: 'gemini-3.8-flash-high' } });
      result(plan);
      break;
    case 'error':
      result('', 'ERROR');
      break;
    case 'unparseable':
      result('Here is my plan: do the thing.');
      break;
    case 'exit':
      process.exit(0);
      break;
    case 'hang':
      setInterval(() => undefined, 1_000);
      break;
    default:
      break;
  }
});
// Hold the process open while it waits for input, as agy does.
const keepAlive = setInterval(() => undefined, 1_000);
lines.on('close', () => {
  if (mode !== 'hang') clearInterval(keepAlive);
});
process.on('SIGTERM', () => process.exit(143));
