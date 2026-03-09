'use strict';

const nodeRunner = require('./node');
const androidRunner = require('./android');

function getRunners(stacks) {
  const runners = [];

  for (const stack of stacks) {
    if (stack === 'node') {
      runners.push(nodeRunner);
    } else if (stack === 'android') {
      runners.push(androidRunner);
    } else if (stack !== 'unknown') {
      process.stderr.write(`vibeaudit: no runner available for stack '${stack}', skipping\n`);
    }
  }

  if (runners.length === 0) {
    process.stderr.write('vibeaudit: no supported stack detected, no checks will run\n');
  }

  return runners;
}

module.exports = { getRunners };
