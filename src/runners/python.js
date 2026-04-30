'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function findPython() {
  for (const cmd of ['python', 'python3']) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (!r.error) return cmd;
  }
  return null;
}

// Walks all .py files, reports SyntaxErrors as a JSON array to stdout
const SYNTAX_SCRIPT = [
  'import ast, os, json',
  'errors = []',
  'skip = frozenset(["__pycache__", ".git", "node_modules", ".venv", "venv"])',
  'for root, dirs, files in os.walk("."):',
  '    dirs[:] = [d for d in dirs if d not in skip]',
  '    for f in files:',
  '        if not f.endswith(".py"): continue',
  '        fpath = os.path.join(root, f)',
  '        try:',
  '            ast.parse(open(fpath, "rb").read(), fpath)',
  '        except SyntaxError as e:',
  '            errors.append({"file": fpath, "line": e.lineno or 0, "message": e.msg or str(e)})',
  'print(json.dumps(errors))',
].join('\n');

function runSyntax(targetPath, py) {
  const start = Date.now();

  const result = spawnSync(py, ['-c', SYNTAX_SCRIPT], {
    cwd: targetPath,
    encoding: 'utf8',
    timeout: 30000
  });

  if (result.error) {
    return {
      name: 'syntax',
      status: 'fail',
      blocking: true,
      duration_ms: Date.now() - start,
      issues: [{ file: '', line: 0, rule: 'syntax-check-error', message: result.error.message }]
    };
  }

  const issues = [];
  try {
    const parsed = JSON.parse(result.stdout.trim());
    for (const e of parsed) {
      issues.push({
        file: e.file.replace(/\\/g, '/').replace(/^\.\//, ''),
        line: e.line,
        rule: 'syntax',
        message: e.message
      });
    }
  } catch (_) {
    const errLine = (result.stderr || '').trim().split('\n')[0];
    if (errLine) {
      issues.push({ file: '', line: 0, rule: 'syntax-check-error', message: errLine });
    }
  }

  return {
    name: 'syntax',
    status: issues.length > 0 ? 'fail' : 'pass',
    blocking: true,
    duration_ms: Date.now() - start,
    issues
  };
}

function hasTestSuite(targetPath) {
  return (
    fs.existsSync(path.join(targetPath, 'tests')) ||
    fs.existsSync(path.join(targetPath, 'test')) ||
    fs.existsSync(path.join(targetPath, 'pytest.ini'))
  );
}

function runTests(targetPath, py) {
  const start = Date.now();

  if (!hasTestSuite(targetPath)) {
    return {
      name: 'tests',
      status: 'skipped',
      blocking: false,
      duration_ms: Date.now() - start,
      issues: []
    };
  }

  const result = spawnSync(py, ['-m', 'pytest', '-q', '--tb=line'], {
    cwd: targetPath,
    encoding: 'utf8',
    timeout: 60000
  });

  const output = (result.stdout || '') + (result.stderr || '');

  if (output.includes('No module named pytest')) {
    return {
      name: 'tests',
      status: 'skipped',
      blocking: false,
      duration_ms: Date.now() - start,
      issues: []
    };
  }

  if (output.includes('no tests ran') || output.includes('collected 0 items')) {
    return {
      name: 'tests',
      status: 'skipped',
      blocking: false,
      duration_ms: Date.now() - start,
      issues: []
    };
  }

  if (result.status === 0) {
    return {
      name: 'tests',
      status: 'pass',
      blocking: true,
      duration_ms: Date.now() - start,
      issues: []
    };
  }

  // "FAILED tests/foo.py::test_bar - AssertionError: x != y"
  const failedLines = output.split('\n').filter(l => l.startsWith('FAILED '));
  const issues = failedLines.map(l => {
    const body = l.slice('FAILED '.length); // "tests/foo.py::test_bar - AssertionError"
    const colonColon = body.indexOf('::');
    const file = colonColon !== -1 ? body.slice(0, colonColon).replace(/\\/g, '/') : '';
    const message = colonColon !== -1 ? body.slice(colonColon + 2) : body;
    return { file, line: 0, rule: 'test-failure', message: message.trim() };
  });

  if (issues.length === 0) {
    issues.push({ file: '', line: 0, rule: 'test-failure', message: 'Tests failed' });
  }

  return {
    name: 'tests',
    status: 'fail',
    blocking: true,
    duration_ms: Date.now() - start,
    issues
  };
}

async function run(targetPath, checks) {
  const py = findPython();

  if (!py) {
    return [{
      name: 'python',
      status: 'fail',
      blocking: true,
      duration_ms: 0,
      issues: [{ file: '', line: 0, rule: 'python-not-found',
        message: 'Python interpreter not found. Install Python and ensure it is on PATH.' }]
    }];
  }

  const checkDefs = [
    { name: 'syntax', fn: () => runSyntax(targetPath, py) },
    { name: 'tests',  fn: () => runTests(targetPath, py) }
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
