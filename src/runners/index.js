'use strict';

const nodeRunner = require('./node');
const androidRunner = require('./android');
const pythonRunner = require('./python');

function getRunners(detected) {
  const pairs = [];

  for (const entry of detected) {
    if (entry.stack === 'node') {
      pairs.push({ runner: nodeRunner, path: entry.path });
    } else if (entry.stack === 'android') {
      pairs.push({ runner: androidRunner, path: entry.path });
    } else if (entry.stack === 'python') {
      pairs.push({ runner: pythonRunner, path: entry.path });
    } else if (entry.stack !== 'unknown') {
      process.stderr.write(`vibeaudit: no runner available for stack '${entry.stack}', skipping\n`);
    }
  }

  if (pairs.length === 0) {
    process.stderr.write('vibeaudit: no supported stack detected, no checks will run\n');
  }

  return pairs;
}

module.exports = { getRunners };
