'use strict';

const path = require('path');
const fs = require('fs');
const { parseCompileOutput, parseLintXml, detectCompileTaskFromOutput } = require('../src/runners/android');

const FIXTURE_PATH = path.join(__dirname, 'fixtures/android');
const FAKE_TARGET = 'C:\\Users\\lars\\AndroidStudioProjects\\Momentum-New';

// --- Compile parser ---

describe('parseCompileOutput', () => {
  const passOutput = fs.readFileSync(path.join(FIXTURE_PATH, 'compile-pass.txt'), 'utf8');
  const failOutput = fs.readFileSync(path.join(FIXTURE_PATH, 'compile-fail.txt'), 'utf8');

  test('returns empty array for successful build output', () => {
    expect(parseCompileOutput(passOutput, FAKE_TARGET)).toEqual([]);
  });

  test('returns 2 issues for failed build output', () => {
    expect(parseCompileOutput(failOutput, FAKE_TARGET)).toHaveLength(2);
  });

  test('first issue has rule kotlin-compile', () => {
    const issues = parseCompileOutput(failOutput, FAKE_TARGET);
    expect(issues[0].rule).toBe('kotlin-compile');
  });

  test('first issue has line 42', () => {
    const issues = parseCompileOutput(failOutput, FAKE_TARGET);
    expect(issues[0].line).toBe(42);
  });

  test('first issue file is relative (does not start with C:)', () => {
    const issues = parseCompileOutput(failOutput, FAKE_TARGET);
    expect(issues[0].file).not.toMatch(/^C:/i);
  });

  test('first issue message contains Unresolved reference', () => {
    const issues = parseCompileOutput(failOutput, FAKE_TARGET);
    expect(issues[0].message).toContain('Unresolved reference');
  });
});

// --- Lint parser ---

describe('parseLintXml', () => {
  const passXml = fs.readFileSync(path.join(FIXTURE_PATH, 'lint-pass.xml'), 'utf8');
  const failXml = fs.readFileSync(path.join(FIXTURE_PATH, 'lint-fail.xml'), 'utf8');

  test('returns empty array when only warnings present', () => {
    expect(parseLintXml(passXml, FAKE_TARGET)).toEqual([]);
  });

  test('returns 1 issue for lint-fail.xml (Error only, not Warning)', () => {
    expect(parseLintXml(failXml, FAKE_TARGET)).toHaveLength(1);
  });

  test('issue has rule MissingPermission', () => {
    const issues = parseLintXml(failXml, FAKE_TARGET);
    expect(issues[0].rule).toBe('MissingPermission');
  });

  test('issue has line 112', () => {
    const issues = parseLintXml(failXml, FAKE_TARGET);
    expect(issues[0].line).toBe(112);
  });

  test('issue file is relative (does not start with C:)', () => {
    const issues = parseLintXml(failXml, FAKE_TARGET);
    expect(issues[0].file).not.toMatch(/^C:/i);
  });

  test('issue message contains permission', () => {
    const issues = parseLintXml(failXml, FAKE_TARGET);
    expect(issues[0].message).toContain('permission');
  });
});

// --- Compile task detection ---

describe('detectCompileTaskFromOutput', () => {
  const agp8Output = fs.readFileSync(path.join(FIXTURE_PATH, 'tasks-agp8.txt'), 'utf8');
  const agp7Output = fs.readFileSync(path.join(FIXTURE_PATH, 'tasks-agp7.txt'), 'utf8');
  const unknownOutput = fs.readFileSync(path.join(FIXTURE_PATH, 'tasks-unknown.txt'), 'utf8');

  test('AGP 8.x output returns app:compileDebugKotlin', () => {
    expect(detectCompileTaskFromOutput(agp8Output)).toBe('app:compileDebugKotlin');
  });

  test('AGP 7.x output returns compileDebugKotlinSources', () => {
    expect(detectCompileTaskFromOutput(agp7Output)).toBe('compileDebugKotlinSources');
  });

  test('unknown output returns null', () => {
    expect(detectCompileTaskFromOutput(unknownOutput)).toBeNull();
  });
});
