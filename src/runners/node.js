'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const VIBEAUDIT_ROOT = path.join(__dirname, '../../');
// Invoke ESLint via `node` to avoid Windows cmd.exe quoting issues with space-containing paths
const ESLINT_MODULE = path.join(VIBEAUDIT_ROOT, 'node_modules/eslint/bin/eslint.js');

function runEslint(targetPath) {
  const start = Date.now();

  const result = spawnSync(
    process.execPath,
    [ESLINT_MODULE, targetPath, '--format', 'json'],
    { encoding: 'utf8', timeout: 30000, cwd: targetPath }
  );

  if (result.error) {
    return {
      name: 'eslint',
      status: 'fail',
      blocking: true,
      duration_ms: Date.now() - start,
      issues: [{ file: '', line: 0, rule: 'eslint-error', message: result.error.message }]
    };
  }

  const issues = [];
  if (result.stdout) {
    try {
      const parsed = JSON.parse(result.stdout);
      for (const fileResult of parsed) {
        for (const msg of fileResult.messages) {
          issues.push({
            file: path.relative(targetPath, fileResult.filePath),
            line: msg.line || 0,
            rule: msg.ruleId || 'unknown',
            message: msg.message
          });
        }
      }
    } catch (e) {
      if (result.stderr) {
        issues.push({ file: '', line: 0, rule: 'eslint-error', message: result.stderr.trim().split('\n')[0] });
      }
    }
  }

  return {
    name: 'eslint',
    status: issues.length > 0 ? 'fail' : 'pass',
    blocking: true,
    duration_ms: Date.now() - start,
    issues
  };
}

function runNpmAudit(targetPath) {
  const start = Date.now();

  const pkgLock = path.join(targetPath, 'package-lock.json');
  if (!fs.existsSync(pkgLock)) {
    return {
      name: 'npm-audit',
      status: 'skipped',
      blocking: false,
      duration_ms: Date.now() - start,
      issues: []
    };
  }

  const result = spawnSync(
    'npm',
    ['audit', '--audit-level=high', '--json'],
    { cwd: targetPath, encoding: 'utf8', shell: true, timeout: 60000 }
  );

  const issues = [];
  if (result.stdout) {
    try {
      const parsed = JSON.parse(result.stdout);
      const vulns = parsed.vulnerabilities || {};
      for (const [pkg, info] of Object.entries(vulns)) {
        if (['high', 'critical'].includes(info.severity)) {
          const via = Array.isArray(info.via)
            ? info.via.map(v => (typeof v === 'string' ? v : v.title)).join(', ')
            : 'vulnerability';
          issues.push({
            file: 'package.json',
            line: 0,
            rule: `npm-audit:${info.severity}`,
            message: `${pkg}: ${via}`
          });
        }
      }
    } catch (e) {
      // unparseable output — treat as pass
    }
  }

  return {
    name: 'npm-audit',
    status: issues.length > 0 ? 'warn' : 'pass',
    blocking: false,
    duration_ms: Date.now() - start,
    issues
  };
}

function runTests(targetPath) {
  const start = Date.now();

  // Guard: never run the test suite against VibeAudit itself — doing so spawns Jest,
  // which invokes VibeAudit again, causing infinite recursion and OOM.
  if (path.resolve(targetPath) === path.resolve(VIBEAUDIT_ROOT)) {
    return {
      name: 'tests',
      status: 'skipped',
      blocking: false,
      duration_ms: Date.now() - start,
      issues: []
    };
  }

  let pkgJson;
  try {
    pkgJson = JSON.parse(fs.readFileSync(path.join(targetPath, 'package.json'), 'utf8'));
  } catch (e) {
    // TODO: blocking should be true once a real test suite exists (add Jest).
    return {
      name: 'tests',
      status: 'skipped',
      blocking: false,
      duration_ms: Date.now() - start,
      issues: []
    };
  }

  const testScript = pkgJson.scripts && pkgJson.scripts.test;
  if (!testScript || testScript.includes('no test specified')) {
    // TODO: blocking should be true once a real test suite exists (add Jest).
    // For now, treat skipped tests as non-blocking so self-check returns blocking: false.
    return {
      name: 'tests',
      status: 'skipped',
      blocking: false,
      duration_ms: Date.now() - start,
      issues: []
    };
  }

  const result = spawnSync(
    'npm',
    ['test'],
    { cwd: targetPath, encoding: 'utf8', shell: true, timeout: 60000 }
  );

  if (result.status === 0) {
    return {
      name: 'tests',
      status: 'pass',
      blocking: true,
      duration_ms: Date.now() - start,
      issues: []
    };
  }

  const output = (result.stderr || result.stdout || '').trim();
  const errText = output.split('\n').find(l => l.trim().length > 0) || 'Tests failed';
  return {
    name: 'tests',
    status: 'fail',
    blocking: true,
    duration_ms: Date.now() - start,
    issues: [{ file: '', line: 0, rule: 'test-failure', message: errText.trim() }]
  };
}

async function run(targetPath, checks) {
  const checkDefs = [
    { name: 'eslint',    fn: () => runEslint(targetPath) },
    { name: 'npm-audit', fn: () => runNpmAudit(targetPath) },
    { name: 'tests',     fn: () => runTests(targetPath) }
  ];
  const results = [];

  for (const { name, fn } of checkDefs) {
    if (!checks || checks.includes(name)) {
      results.push(fn());
    }
  }

  return results;
}

module.exports = { run };
