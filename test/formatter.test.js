'use strict';

const { format } = require('../src/formatter');

// Helper: extract the JSON block from default-mode output
function extractJson(output) {
  const lines = output.split('\n');
  const start = lines.findIndex(l => l.trimStart().startsWith('{'));
  return JSON.parse(lines.slice(start).join('\n'));
}

describe('format() — warnings field', () => {
  const emptyResults = [];
  const passingResults = [
    { name: 'eslint', status: 'pass', blocking: true, duration_ms: 100, issues: [] }
  ];

  test('no warnings field when checks array is non-empty', () => {
    const output = format(passingResults, { json: true, stack: 'node' });
    const payload = JSON.parse(output);
    expect(payload.warnings).toBeUndefined();
  });

  test('no warnings field when checks is empty and no warnings passed', () => {
    const output = format(emptyResults, { json: true, stack: 'unknown' });
    const payload = JSON.parse(output);
    expect(payload.warnings).toBeUndefined();
  });

  test('warnings field present in JSON when warnings array is non-empty', () => {
    const output = format(emptyResults, {
      json: true,
      stack: 'unknown',
      warnings: ['no supported stack detected at: /some/path']
    });
    const payload = JSON.parse(output);
    expect(payload.warnings).toEqual(['no supported stack detected at: /some/path']);
  });

  test('warnings field present in default mode JSON block', () => {
    const output = format(emptyResults, {
      stack: 'unknown',
      warnings: ['no checks matched filter: doesnotexist']
    });
    const payload = extractJson(output);
    expect(payload.warnings).toEqual(['no checks matched filter: doesnotexist']);
  });

  test('warnings NOT present in JSON when warnings array is empty', () => {
    const output = format(emptyResults, { json: true, stack: 'unknown', warnings: [] });
    const payload = JSON.parse(output);
    expect(payload.warnings).toBeUndefined();
  });

  test('terminal output contains warning text when warnings present', () => {
    const output = format(emptyResults, {
      stack: 'unknown',
      warnings: ['no supported stack detected at: /some/path']
    });
    expect(output).toContain('no supported stack detected at: /some/path');
  });

  test('human mode contains warning text', () => {
    const output = format(emptyResults, {
      human: true,
      stack: 'unknown',
      warnings: ['no checks matched filter: typo']
    });
    expect(output).toContain('no checks matched filter: typo');
    // human mode has no JSON block
    expect(output).not.toContain('"warnings"');
  });
});
