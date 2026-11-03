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
 *   stubborn      as ok, but it ignores SIGTERM and leaves a child that holds
 *                 its output open, writing the child's pid to the log
 *   deep_switch   as ok, but a step names another model twelve levels deep
 *   slow_init     init only after two seconds
 *   no_conversation     init naming the lane's model, with no conversation_id
 *   empty_conversation  init naming the lane's model, with an empty conversation_id
 *   tool_end      init; after the input line, a tool-call line and a SUCCESS result
 *                 with an empty response, as agy did when the model asked to run a
 *                 command (Phase4-CR1, 2026-11-03)
 *   odd_events    as ok, after three lines whose event is not a short lowercase name
 *   many          as ok, after seventy step lines
 *   blanks        as ok, after two blank lines (Tier-2 finding 1 at efaa1c9)
 *   many_blanks   as ok, after seventy blank lines
 *   blank_first   a blank line before init, then as ok
 *   bad_then_result  init; after the input line, a line that is not JSON, then a SUCCESS result
 *   flood         as ok, after five thousand step lines each carrying a kilobyte of text
 *   switch_then_result  a step naming another model and a SUCCESS result, in one write
 *   unterminated  init; after the input line, two MiB with no newline, then silence
 *                 (Tier-2 confirmation at ac1097f)
 *
 * Whatever the mode, it first enforces what agy 1.4.7 does, as the Founder
 * read it on the PC on 2026-10-26: `--print` must carry a value and refuses
 * a flag as one; stream-json input needs stream-json output; and an input
 * line must be `{"event":"user","message":{...}}`. A line without `event`,
 * or a `user` line without an object `message`, ends the run with an ERROR
 * result; an unknown event is ignored with a warning.
 */

import { spawn } from 'node:child_process';
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

if (mode === 'blank_first') process.stdout.write('\n');
if (['ok', 'fenced', 'switch', 'error', 'unparseable', 'hang', 'exit', 'stubborn', 'deep_switch', 'tool_end', 'odd_events', 'many', 'blanks', 'many_blanks', 'blank_first', 'bad_then_result', 'flood', 'switch_then_result', 'unterminated'].includes(mode)) {
  init('gemini-4-argon-high');
} else if (mode === 'no_conversation') {
  emit({ event: 'init', init: { model: 'gemini-4-argon-high', cwd: process.cwd() } });
} else if (mode === 'empty_conversation') {
  emit({ event: 'init', conversation_id: '', init: { model: 'gemini-4-argon-high', cwd: process.cwd() } });
} else if (mode === 'slow_init') {
  setTimeout(() => init('gemini-4-argon-high'), 2_000);
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
    case 'deep_switch': {
      let nested: Record<string, unknown> = { model: 'gemini-3.8-flash-high' };
      for (let level = 0; level < 12; level += 1) nested = { inner: nested };
      emit({ event: 'step_update', step_update: { conversation_id: conversation, detail: nested } });
      result(plan);
      break;
    }
    case 'stubborn': {
      const holder = spawn('/bin/sleep', ['60'], { stdio: ['ignore', 'inherit', 'inherit'] });
      if (logPath !== undefined) appendFileSync(logPath, `${JSON.stringify({ holder: holder.pid })}\n`);
      result(plan);
      break;
    }
    case 'error':
      result('', 'ERROR');
      break;
    case 'unparseable':
      result('Here is my plan: do the thing.');
      break;
    case 'tool_end':
      emit({ event: 'tool_call', tool_call: { conversation_id: conversation, name: 'run_command', args: { CommandLine: 'git log -n 15 --oneline' } } });
      result('');
      break;
    case 'odd_events':
      emit({ event: 'Step-Update', step_update: { conversation_id: conversation } });
      emit({ event: 42 });
      emit({ step_update: { conversation_id: conversation } });
      result(plan);
      break;
    case 'many':
      for (let line = 0; line < 70; line += 1) emit({ event: 'step_update', step_update: { conversation_id: conversation, state: 'RUNNING' } });
      result(plan);
      break;
    case 'blanks':
      process.stdout.write('\n   \n');
      result(plan);
      break;
    case 'many_blanks':
      process.stdout.write('\n'.repeat(70));
      result(plan);
      break;
    case 'blank_first':
      emit({ event: 'step_update', step_update: { conversation_id: conversation, state: 'DONE' } });
      result(plan);
      break;
    case 'bad_then_result':
      process.stdout.write('not json\n');
      result(plan);
      break;
    case 'unterminated': {
      const block = 'x'.repeat(64 * 1024);
      for (let part = 0; part < 32; part += 1) process.stdout.write(block);
      setInterval(() => undefined, 1_000);
      break;
    }
    case 'switch_then_result':
      process.stdout.write(
        `${JSON.stringify({ event: 'step_update', step_update: { conversation_id: conversation, model: 'gemini-3.8-flash-high' } })}\n` +
          `${JSON.stringify({ event: 'result', result: { conversation_id: conversation, status: 'SUCCESS', response: plan, num_turns: 1 } })}\n`,
      );
      break;
    case 'flood': {
      const text = 'x'.repeat(1024);
      for (let line = 0; line < 5000; line += 1) emit({ event: 'step_update', step_update: { conversation_id: conversation, text_delta: text } });
      result(plan);
      break;
    }
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
  if (mode !== 'hang' && mode !== 'stubborn') clearInterval(keepAlive);
});
process.on('SIGTERM', () => {
  if (mode !== 'stubborn') process.exit(143);
});
