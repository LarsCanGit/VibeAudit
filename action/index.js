const { spawnSync } = require('child_process');

try {
  const path = process.env.INPUT_PATH || '.';
  const args = ['--path', path, '--json'];
  if (process.env.INPUT_CHECKS) args.push('--checks', process.env.INPUT_CHECKS);

  const r = spawnSync('vibeaudit', args, {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/usr/bin` }
  });

  if (r.error) {
    console.error(`::error::vibeaudit failed to start: ${r.error.message}`);
    process.exit(1);
  }

  const jsonStart = r.stdout.indexOf('{');
  if (jsonStart === -1) {
    console.error('::error::vibeaudit produced no JSON output');
    if (r.stderr) console.error(r.stderr);
    process.exit(1);
  }

  const result = JSON.parse(r.stdout.slice(jsonStart));

  if (result.blocking) {
    console.error('::error::vibeaudit found blocking issues');
    process.exit(1);
  }

  console.log('::notice::vibeaudit passed');
  process.exit(0);

} catch (err) {
  console.error(`::error::vibeaudit failed: ${err.message}`);
  process.exit(1);
}
