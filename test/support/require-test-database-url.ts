/**
 * The `npm run test:storage` prelude (contract §19).
 *
 * The storage suites SKIP themselves when `TEST_DATABASE_URL` is unset, and
 * that is the right default locally: a developer running `npm test` should not
 * need a database. It is exactly the wrong default for the storage command,
 * whose entire purpose is to run those suites — a strict command that quietly
 * skipped everything would report success for a run that proved nothing.
 *
 * So this exits 1, loudly, before the runner starts.
 */

const url = process.env['TEST_DATABASE_URL'];

if (url === undefined || url.trim() === '') {
  process.stderr.write(
    'TEST_DATABASE_URL is required by `npm run test:storage`.\n' +
      '\n' +
      'The storage suites skip themselves without it, so running this command\n' +
      'without a database would report success while proving nothing. Set it to a\n' +
      'THROWAWAY database — never the deployed one, whose variable is DATABASE_URL:\n' +
      '\n' +
      '  TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/buildroom_test \\\n' +
      '    npm run test:storage\n',
  );
  process.exit(1);
}

process.stdout.write(`test:storage — TEST_DATABASE_URL is set; the storage suites will run\n`);
