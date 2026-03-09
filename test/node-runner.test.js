'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const CLI = path.resolve(__dirname, '../bin/vibeaudit.js');
const FIXTURE = path.resolve(__dirname, 'fixtures/node-project');

function runVibeaudit(args = []) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd: path.resolve(__dirname, '..'),
  });
}

function parseJsonBlock(stdout) {
  // With --json flag: output IS the JSON directly
  // Without --json flag: JSON is inside a ```json ... ``` fenced block
  const fenceStart = stdout.indexOf('```json\n');
  if (fenceStart !== -1) {
    const jsonStart = fenceStart + '```json\n'.length;
    const fenceEnd = stdout.indexOf('\n```', jsonStart);
    if (fenceEnd === -1) throw new Error('Unclosed JSON fence block in stdout');
    return JSON.parse(stdout.slice(jsonStart, fenceEnd));
  }
  // Fallback: plain JSON output (--json flag)
  const idx = stdout.indexOf('{');
  if (idx === -1) throw new Error('No JSON block found in stdout');
  return JSON.parse(stdout.slice(idx));
}

describe('node runner — fixture project', () => {
  let result;

  beforeAll(() => {
    result = runVibeaudit(['--path', FIXTURE, '--json']);
  });

  test('result is fail', () => {
    const json = parseJsonBlock(result.stdout);
    expect(json.result).toBe('fail');
  });

  test('blocking is true', () => {
    const json = parseJsonBlock(result.stdout);
    expect(json.blocking).toBe(true);
  });

  test('eslint check status is fail', () => {
    const json = parseJsonBlock(result.stdout);
    const eslint = json.checks.find(c => c.name === 'eslint');
    expect(eslint.status).toBe('fail');
  });

  test('eslint has at least 2 issues', () => {
    const json = parseJsonBlock(result.stdout);
    const eslint = json.checks.find(c => c.name === 'eslint');
    expect(eslint.issues.length).toBeGreaterThanOrEqual(2);
  });

  test('at least one no-undef issue', () => {
    const json = parseJsonBlock(result.stdout);
    const eslint = json.checks.find(c => c.name === 'eslint');
    expect(eslint.issues.some(i => i.rule === 'no-undef')).toBe(true);
  });

  test('at least one no-unused-vars issue', () => {
    const json = parseJsonBlock(result.stdout);
    const eslint = json.checks.find(c => c.name === 'eslint');
    expect(eslint.issues.some(i => i.rule === 'no-unused-vars')).toBe(true);
  });

  test('exit code is 1', () => {
    expect(result.status).toBe(1);
  });
});

describe('node runner — self-check', () => {
  let result;

  beforeAll(() => {
    result = runVibeaudit(['--json']);
  });

  test('result is pass', () => {
    const json = parseJsonBlock(result.stdout);
    expect(json.result).toBe('pass');
  });

  test('blocking is false', () => {
    const json = parseJsonBlock(result.stdout);
    expect(json.blocking).toBe(false);
  });

  test('eslint check status is pass', () => {
    const json = parseJsonBlock(result.stdout);
    const eslint = json.checks.find(c => c.name === 'eslint');
    expect(eslint.status).toBe('pass');
  });

  test('eslint issues is empty', () => {
    const json = parseJsonBlock(result.stdout);
    const eslint = json.checks.find(c => c.name === 'eslint');
    expect(eslint.issues).toHaveLength(0);
  });

  test('exit code is 0', () => {
    expect(result.status).toBe(0);
  });
});

describe('JSON block always present', () => {
  test('JSON block present without --json flag', () => {
    const result = runVibeaudit([]);
    expect(() => parseJsonBlock(result.stdout)).not.toThrow();
    const json = parseJsonBlock(result.stdout);
    expect(json).toHaveProperty('vibeaudit');
    expect(json).toHaveProperty('result');
  });
});
