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

describe('format() — check rendering', () => {
  test('renders a passing check with duration suffix', () => {
    const results = [
      { name: 'eslint', status: 'pass', blocking: true, duration_ms: 123, issues: [] }
    ];
    const output = format(results, { human: true, stack: 'node' });
    expect(output).toContain('eslint');
    expect(output).toContain('123ms');
    // blocking checks do NOT show [non-blocking]
    expect(output).not.toContain('[non-blocking]');
  });

  test('renders a non-blocking check with [non-blocking] suffix', () => {
    const results = [
      { name: 'npm-audit', status: 'pass', blocking: false, duration_ms: 200, issues: [] }
    ];
    const output = format(results, { human: true, stack: 'node' });
    expect(output).toContain('npm-audit');
    expect(output).toContain('200ms');
    expect(output).toContain('[non-blocking]');
  });

  test('renders a skipped check with skipped suffix (no duration)', () => {
    const results = [
      { name: 'tests', status: 'skipped', blocking: false, duration_ms: 0, issues: [] }
    ];
    const output = format(results, { human: true, stack: 'node' });
    expect(output).toContain('tests');
    expect(output).toContain('skipped');
  });

  test('renders issues with file, line, rule, and message', () => {
    const results = [
      {
        name: 'eslint',
        status: 'fail',
        blocking: true,
        duration_ms: 50,
        issues: [
          { file: 'src/index.js', line: 42, rule: 'no-unused-vars', message: "'x' is defined but never used" }
        ]
      }
    ];
    const output = format(results, { human: true, stack: 'node' });
    expect(output).toContain('src/index.js:42');
    expect(output).toContain('[no-unused-vars]');
    expect(output).toContain("'x' is defined but never used");
  });

  test('renders issues without file or rule (message only)', () => {
    const results = [
      {
        name: 'npm-audit',
        status: 'warn',
        blocking: false,
        duration_ms: 100,
        issues: [
          { message: 'vulnerable dependency: lodash' }
        ]
      }
    ];
    const output = format(results, { human: true, stack: 'node' });
    expect(output).toContain('vulnerable dependency: lodash');
  });

  test('truncates issues at 10 and shows overflow count', () => {
    const issues = Array.from({ length: 15 }, (_, i) => ({
      file: `src/file${i}.js`,
      line: i + 1,
      rule: 'no-undef',
      message: `issue ${i}`
    }));
    const results = [
      { name: 'eslint', status: 'fail', blocking: true, duration_ms: 100, issues }
    ];
    const output = format(results, { human: true, stack: 'node' });
    // First 10 issues rendered
    expect(output).toContain('src/file0.js:1');
    expect(output).toContain('src/file9.js:10');
    // Issue 11–15 suppressed
    expect(output).not.toContain('src/file10.js');
    expect(output).not.toContain('src/file14.js');
    // Overflow line present
    expect(output).toContain('... and 5 more issues');
  });

  test('uses ? icon for unrecognised status', () => {
    const results = [
      { name: 'custom', status: 'unknown-status', blocking: false, duration_ms: 10, issues: [] }
    ];
    const output = format(results, { human: true, stack: 'node' });
    expect(output).toContain('?');
    expect(output).toContain('custom');
  });
});
