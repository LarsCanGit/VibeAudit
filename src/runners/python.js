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
  'skip = frozenset(["__pycache__", ".git", "node_modules", ".venv", "venv", "env"])',
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

// Collects top-level import names via AST, checks each with importlib.util.find_spec
const IMPORT_SCRIPT = [
  'import ast, os, json, sys, importlib.util',
  'skip = frozenset(["__pycache__", ".git", "node_modules", ".venv", "venv", "env"])',
  // Collect all local module names: any .py filename or package dir anywhere in the tree
  'local_modules = set()',
  'for root, dirs, files in os.walk("."):',
  '    dirs[:] = [d for d in dirs if d not in skip]',
  '    for f in files:',
  '        if f.endswith(".py") and f != "__init__.py":',
  '            local_modules.add(f[:-3])',
  '    for d in dirs:',
  '        if os.path.exists(os.path.join(root, d, "__init__.py")):',
  '            local_modules.add(d)',
  'names = set()',
  'for root, dirs, files in os.walk("."):',
  '    dirs[:] = [d for d in dirs if d not in skip]',
  '    for f in files:',
  '        if not f.endswith(".py"): continue',
  '        try:',
  '            tree = ast.parse(open(os.path.join(root, f), "rb").read())',
  '        except SyntaxError:',
  '            continue',
  '        for node in ast.walk(tree):',
  '            if isinstance(node, ast.Import):',
  '                for alias in node.names: names.add(alias.name.split(".")[0])',
  '            elif isinstance(node, ast.ImportFrom):',
  '                if node.level == 0 and node.module:',
  '                    names.add(node.module.split(".")[0])',
  'missing = []',
  'stdlib = getattr(sys, "stdlib_module_names", None)',
  'declared = set()',
  'if os.path.exists("requirements.txt"):',
  '    for line in open("requirements.txt"):',
  '        line = line.strip()',
  '        if not line or line.startswith("#"): continue',
  '        name = line.split("[")[0].split("==")[0].split(">=")[0].split("<=")[0].split("~=")[0].split("!=")[0].strip()',
  '        declared.add(name.lower().replace("-", "_"))',
  'for name in sorted(names):',
  '    if name.startswith("_"): continue',
  '    if name == "__future__": continue',
  '    if stdlib and name in stdlib: continue',
  '    if name in local_modules: continue',
  '    if name.lower().replace("-", "_") in declared: continue',
  '    spec = importlib.util.find_spec(name)',
  '    if spec is None: missing.append(name)',
  'print(json.dumps(missing))',
].join('\n');

function runImports(targetPath, py) {
  const start = Date.now();

  // Prefer pyflakes if available
  const pyflakesCheck = spawnSync(py, ['-m', 'pyflakes', '--version'], {
    cwd: targetPath,
    encoding: 'utf8',
    timeout: 5000
  });
  const hasPyflakes = !pyflakesCheck.error && pyflakesCheck.status === 0;

  if (hasPyflakes) {
    const result = spawnSync(py, ['-m', 'pyflakes', '.'], {
      cwd: targetPath,
      encoding: 'utf8',
      timeout: 30000
    });

    const issues = [];
    const output = result.stdout || '';
    for (const line of output.split('\n')) {
      if (line.includes('unable to import')) {
        // pyflakes format: "file.py:N: 'X' unable to import"
        const match = line.match(/^(.+?):(\d+):\s*(.+)$/);
        if (match) {
          issues.push({
            file: match[1].replace(/\\/g, '/').replace(/^\.\//, ''),
            line: parseInt(match[2], 10) || 0,
            rule: 'import-unresolved',
            message: match[3].trim()
          });
        } else {
          issues.push({ file: '', line: 0, rule: 'import-unresolved', message: line.trim() });
        }
      }
    }

    return {
      name: 'imports',
      status: issues.length > 0 ? 'fail' : 'pass',
      blocking: true,
      duration_ms: Date.now() - start,
      issues
    };
  }

  // Fallback: AST-based importlib.util.find_spec check
  const result = spawnSync(py, ['-c', IMPORT_SCRIPT], {
    cwd: targetPath,
    encoding: 'utf8',
    timeout: 30000
  });

  if (result.error) {
    return {
      name: 'imports',
      status: 'fail',
      blocking: true,
      duration_ms: Date.now() - start,
      issues: [{ file: '', line: 0, rule: 'import-check-error', message: result.error.message }]
    };
  }

  const issues = [];
  try {
    const missing = JSON.parse(result.stdout.trim());
    for (const name of missing) {
      issues.push({ file: '', line: 0, rule: 'import-unresolved', message: `Cannot resolve import '${name}'` });
    }
  } catch (_) {
    const errLine = (result.stderr || '').trim().split('\n')[0];
    if (errLine) {
      issues.push({ file: '', line: 0, rule: 'import-check-error', message: errLine });
    }
  }

  return {
    name: 'imports',
    status: issues.length > 0 ? 'fail' : 'pass',
    blocking: true,
    duration_ms: Date.now() - start,
    issues
  };
}

// Common import name → package name mismatches
const IMPORT_TO_PACKAGE = {
  PIL: 'pillow',
  cv2: 'opencv-python',
  sklearn: 'scikit-learn',
  bs4: 'beautifulsoup4',
  yaml: 'pyyaml',
  dateutil: 'python-dateutil',
  dotenv: 'python-dotenv',
  Crypto: 'pycryptodome',
};

// Collects top-level import names via AST, returns JSON array
const COLLECT_IMPORTS_SCRIPT = [
  'import ast, os, json, sys',
  'skip = frozenset(["__pycache__", ".git", "node_modules", ".venv", "venv", "env"])',
  // Collect local module names to avoid false-positive requirements warnings
  'local_modules = set()',
  'for root, dirs, files in os.walk("."):',
  '    dirs[:] = [d for d in dirs if d not in skip]',
  '    for f in files:',
  '        if f.endswith(".py") and f != "__init__.py":',
  '            local_modules.add(f[:-3])',
  '    for d in list(dirs):',
  '        if os.path.exists(os.path.join(root, d, "__init__.py")):',
  '            local_modules.add(d)',
  'names = set()',
  'for root, dirs, files in os.walk("."):',
  '    dirs[:] = [d for d in dirs if d not in skip]',
  '    for f in files:',
  '        if not f.endswith(".py"): continue',
  '        try:',
  '            tree = ast.parse(open(os.path.join(root, f), "rb").read())',
  '        except SyntaxError:',
  '            continue',
  '        for node in ast.walk(tree):',
  '            if isinstance(node, ast.Import):',
  '                for alias in node.names: names.add(alias.name.split(".")[0])',
  '            elif isinstance(node, ast.ImportFrom):',
  '                if node.level == 0 and node.module:',
  '                    names.add(node.module.split(".")[0])',
  'stdlib = getattr(sys, "stdlib_module_names", set())',
  'third_party = [n for n in sorted(names) if not n.startswith("_") and n != "__future__" and n not in stdlib and n not in local_modules]',
  'print(json.dumps(third_party))',
].join('\n');

function parseRequirements(reqPath) {
  const lines = fs.readFileSync(reqPath, 'utf8').split('\n');
  const packages = new Set();
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('-r ') || line.startsWith('--')) continue;
    // Strip editable installs and VCS prefixes
    if (line.startsWith('-e ') || line.startsWith('git+') || line.startsWith('http')) continue;
    // Strip extras like package[security]
    line = line.replace(/\[.*?\]/, '');
    // Strip version specifiers
    line = line.split(/[=<>!~;@]/)[0].trim();
    if (line) packages.add(line.toLowerCase().replace(/-/g, '_'));
  }
  return packages;
}

function runRequirements(targetPath, py) {
  const start = Date.now();
  const reqPath = path.join(targetPath, 'requirements.txt');

  if (!fs.existsSync(reqPath)) {
    return {
      name: 'requirements',
      status: 'skipped',
      blocking: false,
      duration_ms: Date.now() - start,
      issues: []
    };
  }

  let reqPackages;
  try {
    reqPackages = parseRequirements(reqPath);
  } catch (e) {
    return {
      name: 'requirements',
      status: 'fail',
      blocking: false,
      duration_ms: Date.now() - start,
      issues: [{ file: 'requirements.txt', line: 0, rule: 'requirements-parse-error', message: e.message }]
    };
  }

  const result = spawnSync(py, ['-c', COLLECT_IMPORTS_SCRIPT], {
    cwd: targetPath,
    encoding: 'utf8',
    timeout: 30000
  });

  if (result.error) {
    return {
      name: 'requirements',
      status: 'fail',
      blocking: false,
      duration_ms: Date.now() - start,
      issues: [{ file: '', line: 0, rule: 'requirements-check-error', message: result.error.message }]
    };
  }

  let importedNames = [];
  try {
    importedNames = JSON.parse(result.stdout.trim());
  } catch (_) {
    return {
      name: 'requirements',
      status: 'pass',
      blocking: false,
      duration_ms: Date.now() - start,
      issues: []
    };
  }

  const issues = [];
  for (const name of importedNames) {
    // Resolve import name to package name
    const packageName = (IMPORT_TO_PACKAGE[name] || name).toLowerCase().replace(/-/g, '_');
    if (!reqPackages.has(packageName)) {
      issues.push({
        file: '',
        line: 0,
        rule: 'missing-requirement',
        message: `'${name}' imported but not found in requirements.txt`
      });
    }
  }

  return {
    name: 'requirements',
    status: issues.length > 0 ? 'warn' : 'pass',
    blocking: false,
    duration_ms: Date.now() - start,
    issues
  };
}

function hasTestSuite(targetPath) {
  if (fs.existsSync(path.join(targetPath, 'tests'))) return true;
  if (fs.existsSync(path.join(targetPath, 'test'))) return true;
  if (fs.existsSync(path.join(targetPath, 'pytest.ini'))) return true;
  const pyproject = path.join(targetPath, 'pyproject.toml');
  if (fs.existsSync(pyproject)) {
    try {
      return fs.readFileSync(pyproject, 'utf8').includes('[tool.pytest.ini_options]');
    } catch (_) {}
  }
  return false;
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

  if (result.error) {
    const isTimeout = result.error.code === 'ETIMEDOUT';
    return {
      name: 'tests',
      status: 'fail',
      blocking: true,
      duration_ms: Date.now() - start,
      issues: [{
        file: '', line: 0,
        rule: isTimeout ? 'test-timeout' : 'test-run-error',
        message: isTimeout ? 'Tests timed out after 60s' : result.error.message
      }]
    };
  }

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
    { name: 'syntax',       fn: () => runSyntax(targetPath, py) },
    { name: 'imports',      fn: () => runImports(targetPath, py) },
    { name: 'requirements', fn: () => runRequirements(targetPath, py) },
    { name: 'tests',        fn: () => runTests(targetPath, py) }
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
