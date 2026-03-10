const { execSync } = require('child_process');

try {
  const path = process.env.INPUT_PATH || '.';
  const checks = process.env.INPUT_CHECKS ? `--checks ${process.env.INPUT_CHECKS}` : '';
  
  const cmd = `vibeaudit --path ${path} ${checks} --json`.trim();
  
  const output = execSync(cmd, { 
    encoding: 'utf8', 
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/usr/bin` }
  });

  const jsonStart = output.indexOf('{');
  const result = JSON.parse(output.slice(jsonStart));

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