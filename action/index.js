const core = require('@actions/core');
const { execSync } = require('child_process');

try {
  const path = core.getInput('path') || '.';
  const checks = core.getInput('checks');

  // Build the command
  let cmd = `npx @lmhansen/vibeaudit --path ${path} --json`;
  if (checks) cmd += ` --checks ${checks}`;

  const output = execSync(cmd, { encoding: 'utf8' });

  // Parse JSON result
  const jsonStart = output.indexOf('{');
  const result = JSON.parse(output.slice(jsonStart));

  core.setOutput('result', result.blocking ? 'fail' : 'pass');

  if (result.blocking) {
    core.setFailed('vibeaudit found blocking issues');
  }
} catch (err) {
  core.setFailed(`vibeaudit failed: ${err.message}`);
}
