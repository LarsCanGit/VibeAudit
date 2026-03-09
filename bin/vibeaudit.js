#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const path = require('path');
const { detect } = require('../src/detector');
const { getRunners } = require('../src/runners/index');
const { format } = require('../src/formatter');
const { version } = require('../package.json');

program
  .name('vibeaudit')
  .version(version)
  .option('--json', 'output JSON only, no terminal formatting')
  .option('--path <dir>', 'target directory to check (default: cwd)')
  .option('--checks <list>', 'comma-separated list of checks to run (e.g. eslint,tests)')
  .parse(process.argv);

const opts = program.opts();
const targetPath = path.resolve(opts.path || process.cwd());
const checksFilter = opts.checks ? opts.checks.split(',').map(s => s.trim()) : null;

async function main() {
  const stacks = detect(targetPath);
  const runners = getRunners(stacks);

  const allResults = [];
  for (const runner of runners) {
    const results = await runner.run(targetPath, checksFilter);
    allResults.push(...results);
  }

  const stack = stacks.filter(s => s !== 'unknown').join('+') || 'unknown';
  const output = format(allResults, { json: opts.json, stack });

  process.stdout.write(output + '\n');

  const hasBlockingFailure = allResults.some(r => r.blocking && r.status === 'fail');
  process.exit(hasBlockingFailure ? 1 : 0);
}

main().catch(err => {
  process.stderr.write('vibeaudit error: ' + err.message + '\n');
  process.exit(1);
});
