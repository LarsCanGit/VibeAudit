'use strict';

const path = require('path');

// jest.mock calls are hoisted before any require.
jest.mock('child_process');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

const { spawnSync } = require('child_process');
const fs = require('fs');
const { run } = require('../src/runners/python');

// ---------------------------------------------------------------------------
// Path constants — path.join gives OS-native separators, matching what the
// runner constructs internally with path.join(targetPath, ...).
// ---------------------------------------------------------------------------
const FAKE_PROJECT  = path.join('C:', 'fake', 'python');
const REQ_PATH      = path.join(FAKE_PROJECT, 'requirements.txt');
const TESTS_DIR     = path.join(FAKE_PROJECT, 'tests');
const TEST_DIR      = path.join(FAKE_PROJECT, 'test');
const PYTEST_INI    = path.join(FAKE_PROJECT, 'pytest.ini');
const CONFTEST      = path.join(FAKE_PROJECT, 'conftest.py');
const PYPROJECT     = path.join(FAKE_PROJECT, 'pyproject.toml');
const SETUP_CFG     = path.join(FAKE_PROJECT, 'setup.cfg');
const TOX_INI       = path.join(FAKE_PROJECT, 'tox.ini');

// ---------------------------------------------------------------------------
// defaultSync — happy-path routing used as the base in beforeEach.
// Individual tests call spawnSync.mockImplementation() to override specific
// arms; they fall through to this function for everything else.
// ---------------------------------------------------------------------------
function defaultSync(cmd, args) {
  // findPython
  if (args.includes('--version')) {
    return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
  }
  // checkPyflakesAvailable
  if (args[0] === '-c' && args[1] === 'import pyflakes') {
    return { stdout: '', stderr: '', status: 0 };
  }
  // runSyntax — SYNTAX_SCRIPT contains 'ast.parse'
  if (args[0] === '-c' && args[1] && args[1].includes('ast.parse')) {
    return { stdout: JSON.stringify([]), stderr: '', status: 0 };
  }
  // runAstWalk — COMBINED_AST_SCRIPT contains 'importlib.util'
  if (args[0] === '-c' && args[1] && args[1].includes('importlib.util')) {
    return { stdout: JSON.stringify({ missing: [], third_party: [] }), stderr: '', status: 0 };
  }
  // runImports via pyflakes
  if (args[0] === '-m' && args[1] === 'pyflakes') {
    return { stdout: '', stderr: '', status: 0 };
  }
  // runTests via pytest
  if (args[0] === '-m' && args[1] === 'pytest') {
    return { stdout: '1 passed\n', stderr: '', status: 0 };
  }
  return { stdout: '', stderr: '', status: 0 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Set up a test that needs a test suite present plus a custom pytest response.
function withTestSuite(sentinelPath, pytestResult, fileContent = null) {
  fs.existsSync.mockImplementation(p => p === sentinelPath);
  if (fileContent !== null) {
    fs.readFileSync.mockImplementation(p => (p === sentinelPath ? fileContent : ''));
  }
  spawnSync.mockImplementation((cmd, args) => {
    if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
    if (args[0] === '-m' && args[1] === 'pytest') return pytestResult;
    return { stdout: '', stderr: '', status: 0 };
  });
}

// Set up a test that exercises runRequirements with specific requirements.txt
// content and a specific third_party list from the AST walk.
function setupReqs(reqContent, thirdParty = []) {
  fs.existsSync.mockImplementation(p => p === REQ_PATH);
  fs.readFileSync.mockReturnValue(reqContent);
  spawnSync.mockImplementation((cmd, args) => {
    if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
    if (args[0] === '-c' && args[1] && args[1].includes('importlib.util')) {
      return { stdout: JSON.stringify({ missing: [], third_party: thirdParty }), stderr: '', status: 0 };
    }
    return defaultSync(cmd, args);
  });
}

// ---------------------------------------------------------------------------
// Default mock state (reset before each test)
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  // No files present by default: no requirements.txt, no test dirs, no sentinels.
  fs.existsSync.mockReturnValue(false);
  fs.readFileSync.mockReturnValue('');
  spawnSync.mockImplementation(defaultSync);
});

// ===========================================================================
// findPython
// ===========================================================================

describe('findPython', () => {
  test('uses "python" when python is available on PATH', () => {
    // Default: python --version succeeds. Verify the syntax check is issued
    // to 'python', not 'python3'.
    run(FAKE_PROJECT, ['syntax']);
    expect(spawnSync).toHaveBeenCalledWith(
      'python',
      expect.arrayContaining(['-c']),
      expect.objectContaining({ cwd: FAKE_PROJECT })
    );
    expect(spawnSync).not.toHaveBeenCalledWith(
      'python3',
      expect.arrayContaining(['-c']),
      expect.anything()
    );
  });

  test('falls back to "python3" when "python" is not found', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) {
        if (cmd === 'python') return { error: new Error('ENOENT'), stdout: '', stderr: '', status: 1 };
        return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 }; // python3 succeeds
      }
      return defaultSync(cmd, args);
    });
    run(FAKE_PROJECT, ['syntax']);
    expect(spawnSync).toHaveBeenCalledWith(
      'python3',
      expect.arrayContaining(['-c']),
      expect.objectContaining({ cwd: FAKE_PROJECT })
    );
  });

  test('returns python-not-found result when neither python nor python3 is available', () => {
    spawnSync.mockImplementation((_cmd, args) => {
      if (args.includes('--version')) return { error: new Error('ENOENT'), stdout: '', stderr: '', status: 1 };
      return { stdout: '', stderr: '', status: 0 };
    });
    const results = run(FAKE_PROJECT, null);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('python');
    expect(results[0].status).toBe('fail');
    expect(results[0].blocking).toBe(true);
    expect(results[0].issues[0].rule).toBe('python-not-found');
  });
});

// ===========================================================================
// runSyntax
// ===========================================================================

describe('runSyntax', () => {
  test('returns pass when the AST walk finds no syntax errors', () => {
    const [result] = run(FAKE_PROJECT, ['syntax']);
    expect(result.name).toBe('syntax');
    expect(result.status).toBe('pass');
    expect(result.blocking).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('returns fail with parsed issues when syntax errors are reported', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[0] === '-c' && args[1] && args[1].includes('ast.parse')) {
        return {
          stdout: JSON.stringify([
            { file: './app/main.py', line: 5, message: 'invalid syntax' }
          ]),
          stderr: '',
          status: 0
        };
      }
      return defaultSync(cmd, args);
    });
    const [result] = run(FAKE_PROJECT, ['syntax']);
    expect(result.status).toBe('fail');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].rule).toBe('syntax');
    expect(result.issues[0].line).toBe(5);
    expect(result.issues[0].message).toBe('invalid syntax');
    // Runner strips leading "./" from file paths
    expect(result.issues[0].file).toBe('app/main.py');
  });

  test('returns fail/syntax-check-error when spawnSync itself returns an error', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[0] === '-c' && args[1] && args[1].includes('ast.parse')) {
        return { error: new Error('spawn failed'), stdout: '', stderr: '', status: null };
      }
      return defaultSync(cmd, args);
    });
    const [result] = run(FAKE_PROJECT, ['syntax']);
    expect(result.status).toBe('fail');
    expect(result.issues[0].rule).toBe('syntax-check-error');
    expect(result.issues[0].message).toBe('spawn failed');
  });

  test('returns fail/syntax-check-error with stderr line when stdout is not valid JSON', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[0] === '-c' && args[1] && args[1].includes('ast.parse')) {
        return { stdout: 'not-json', stderr: 'Traceback: bad token at line 1', status: 1 };
      }
      return defaultSync(cmd, args);
    });
    const [result] = run(FAKE_PROJECT, ['syntax']);
    expect(result.status).toBe('fail');
    expect(result.issues[0].rule).toBe('syntax-check-error');
    expect(result.issues[0].message).toBe('Traceback: bad token at line 1');
  });
});

// ===========================================================================
// runImports — pyflakes path
// ===========================================================================

describe('runImports — pyflakes path', () => {
  test('returns pass when pyflakes emits no "unable to import" lines', () => {
    // Default mock: pyflakes available, no output
    const [result] = run(FAKE_PROJECT, ['imports']);
    expect(result.name).toBe('imports');
    expect(result.status).toBe('pass');
    expect(result.blocking).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('returns fail with parsed file/line/rule when pyflakes reports an unresolved import', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[1] === 'import pyflakes') return { stdout: '', stderr: '', status: 0 };
      if (args[0] === '-m' && args[1] === 'pyflakes') {
        return {
          stdout: "app/main.py:3: 'requests' unable to import 'requests'\n",
          stderr: '',
          status: 1
        };
      }
      return defaultSync(cmd, args);
    });
    const [result] = run(FAKE_PROJECT, ['imports']);
    expect(result.status).toBe('fail');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].file).toBe('app/main.py');
    expect(result.issues[0].line).toBe(3);
    expect(result.issues[0].rule).toBe('import-unresolved');
  });

  test('returns fail with empty location when the pyflakes line has no file:line prefix', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[1] === 'import pyflakes') return { stdout: '', stderr: '', status: 0 };
      if (args[0] === '-m' && args[1] === 'pyflakes') {
        // 'unable to import' present but no "file:line: message" shape
        return { stdout: "unable to import 'requests'\n", stderr: '', status: 1 };
      }
      return defaultSync(cmd, args);
    });
    const [result] = run(FAKE_PROJECT, ['imports']);
    expect(result.status).toBe('fail');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].file).toBe('');
    expect(result.issues[0].line).toBe(0);
    expect(result.issues[0].rule).toBe('import-unresolved');
  });
});

// ===========================================================================
// runImports — AST fallback (pyflakes not installed)
// ===========================================================================

describe('runImports — AST fallback (no pyflakes)', () => {
  // Make pyflakes unavailable so the runner falls back to runAstWalk.
  function noPyflakes(cmd, args) {
    if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
    if (args[1] === 'import pyflakes') {
      return { error: new Error('No module named pyflakes'), stdout: '', stderr: '', status: 1 };
    }
    return defaultSync(cmd, args);
  }

  test('returns pass when AST walk finds no missing imports', () => {
    spawnSync.mockImplementation(noPyflakes);
    const [result] = run(FAKE_PROJECT, ['imports']);
    expect(result.name).toBe('imports');
    expect(result.status).toBe('pass');
    expect(result.blocking).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('returns fail with import-unresolved issues when AST walk finds undeclared deps', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[1] === 'import pyflakes') {
        return { error: new Error('No module named pyflakes'), stdout: '', stderr: '', status: 1 };
      }
      if (args[0] === '-c' && args[1] && args[1].includes('importlib.util')) {
        return {
          stdout: JSON.stringify({ missing: ['requests'], third_party: ['requests'] }),
          stderr: '',
          status: 0
        };
      }
      return defaultSync(cmd, args);
    });
    const [result] = run(FAKE_PROJECT, ['imports']);
    expect(result.status).toBe('fail');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].rule).toBe('import-unresolved');
    expect(result.issues[0].message).toContain('requests');
  });

  test('returns fail/import-check-error when runAstWalk returns a spawnSync error', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[1] === 'import pyflakes') {
        return { error: new Error('No module named pyflakes'), stdout: '', stderr: '', status: 1 };
      }
      if (args[0] === '-c' && args[1] && args[1].includes('importlib.util')) {
        return { error: new Error('AST walk crashed'), stdout: '', stderr: '', status: null };
      }
      return defaultSync(cmd, args);
    });
    const [result] = run(FAKE_PROJECT, ['imports']);
    expect(result.status).toBe('fail');
    expect(result.issues[0].rule).toBe('import-check-error');
    expect(result.issues[0].message).toBe('AST walk crashed');
  });

  test('returns fail/import-check-error when runAstWalk stdout is not valid JSON', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[1] === 'import pyflakes') {
        return { error: new Error('No module named pyflakes'), stdout: '', stderr: '', status: 1 };
      }
      if (args[0] === '-c' && args[1] && args[1].includes('importlib.util')) {
        return { stdout: 'not-json', stderr: 'Traceback: something went wrong', status: 1 };
      }
      return defaultSync(cmd, args);
    });
    const [result] = run(FAKE_PROJECT, ['imports']);
    expect(result.status).toBe('fail');
    expect(result.issues[0].rule).toBe('import-check-error');
    expect(result.issues[0].message).toBe('Traceback: something went wrong');
  });
});

// ===========================================================================
// parseRequirements — line format parsing
// (parseRequirements is not exported; exercised via run(['requirements']))
// ===========================================================================

describe('parseRequirements — line format parsing', () => {
  test('strips version specifiers and normalises package names to lowercase_with_underscores', () => {
    setupReqs('requests==2.31.0\nFlask>=2.0\n', ['requests', 'flask']);
    const [result] = run(FAKE_PROJECT, ['requirements']);
    // Both are declared: requests==2.31.0 → "requests", Flask>=2.0 → "flask"
    expect(result.status).toBe('pass');
    expect(result.issues).toHaveLength(0);
  });

  test('skips blank lines, comment lines, and -r includes', () => {
    setupReqs('# a comment\n\n-r other-requirements.txt\nrequests==2.31.0\n', ['requests']);
    const [result] = run(FAKE_PROJECT, ['requirements']);
    expect(result.status).toBe('pass');
  });

  test('skips editable installs and VCS/HTTP references', () => {
    setupReqs('-e .\ngit+https://github.com/foo/bar.git\nhttp://example.com/pkg.tar.gz\nrequests\n', ['requests']);
    const [result] = run(FAKE_PROJECT, ['requirements']);
    expect(result.status).toBe('pass');
  });

  test('strips extras notation (e.g. requests[security]) before normalising', () => {
    setupReqs('requests[security]==2.31.0\n', ['requests']);
    const [result] = run(FAKE_PROJECT, ['requirements']);
    expect(result.status).toBe('pass');
  });

  test('applies IMPORT_TO_PACKAGE alias mapping (PIL import → pillow package)', () => {
    // The code maps PIL → pillow when comparing import names to requirements.txt
    setupReqs('pillow==10.0.0\n', ['PIL']);
    const [result] = run(FAKE_PROJECT, ['requirements']);
    expect(result.status).toBe('pass');
  });
});

// ===========================================================================
// runRequirements
// ===========================================================================

describe('runRequirements', () => {
  test('returns skipped (non-blocking) when requirements.txt does not exist', () => {
    // fs.existsSync returns false by default — no requirements.txt present
    const [result] = run(FAKE_PROJECT, ['requirements']);
    expect(result.name).toBe('requirements');
    expect(result.status).toBe('skipped');
    expect(result.blocking).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  test('returns fail/requirements-parse-error when readFileSync throws', () => {
    fs.existsSync.mockImplementation(p => p === REQ_PATH);
    fs.readFileSync.mockImplementation(() => { throw new Error('Permission denied'); });
    const [result] = run(FAKE_PROJECT, ['requirements']);
    expect(result.status).toBe('fail');
    expect(result.blocking).toBe(false);
    expect(result.issues[0].rule).toBe('requirements-parse-error');
    expect(result.issues[0].message).toBe('Permission denied');
  });

  test('returns fail/requirements-check-error when runAstWalk fails', () => {
    fs.existsSync.mockImplementation(p => p === REQ_PATH);
    fs.readFileSync.mockReturnValue('requests\n');
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[0] === '-c' && args[1] && args[1].includes('importlib.util')) {
        return { error: new Error('AST walk crashed'), stdout: '', stderr: '', status: null };
      }
      return defaultSync(cmd, args);
    });
    const [result] = run(FAKE_PROJECT, ['requirements']);
    expect(result.status).toBe('fail');
    expect(result.blocking).toBe(false);
    expect(result.issues[0].rule).toBe('requirements-check-error');
    expect(result.issues[0].message).toBe('AST walk crashed');
  });

  test('returns warn with missing-requirement when a third-party import is absent from requirements.txt', () => {
    fs.existsSync.mockImplementation(p => p === REQ_PATH);
    fs.readFileSync.mockReturnValue('flask\n'); // only flask declared
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[0] === '-c' && args[1] && args[1].includes('importlib.util')) {
        return {
          stdout: JSON.stringify({ missing: [], third_party: ['flask', 'requests'] }),
          stderr: '',
          status: 0
        };
      }
      return defaultSync(cmd, args);
    });
    const [result] = run(FAKE_PROJECT, ['requirements']);
    expect(result.name).toBe('requirements');
    expect(result.status).toBe('warn');
    expect(result.blocking).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].rule).toBe('missing-requirement');
    expect(result.issues[0].message).toContain('requests');
  });

  test('returns pass when all third-party imports are declared in requirements.txt', () => {
    fs.existsSync.mockImplementation(p => p === REQ_PATH);
    fs.readFileSync.mockReturnValue('flask\nrequests\n');
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[0] === '-c' && args[1] && args[1].includes('importlib.util')) {
        return {
          stdout: JSON.stringify({ missing: [], third_party: ['flask', 'requests'] }),
          stderr: '',
          status: 0
        };
      }
      return defaultSync(cmd, args);
    });
    const [result] = run(FAKE_PROJECT, ['requirements']);
    expect(result.status).toBe('pass');
    expect(result.issues).toHaveLength(0);
  });
});

// ===========================================================================
// hasTestSuite — sentinel detection (exercised via run(['tests']))
// ===========================================================================

describe('hasTestSuite', () => {
  const passPytest = { stdout: '2 passed\n', stderr: '', status: 0 };

  test('returns skipped when no test suite sentinel exists', () => {
    // fs.existsSync returns false for everything — no test dirs, no config files
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.name).toBe('tests');
    expect(result.status).toBe('skipped');
    expect(result.blocking).toBe(false);
  });

  test('detects "tests/" directory', () => {
    withTestSuite(TESTS_DIR, passPytest);
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.status).toBe('pass');
  });

  test('detects "test/" directory', () => {
    withTestSuite(TEST_DIR, passPytest);
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.status).toBe('pass');
  });

  test('detects "pytest.ini" sentinel file', () => {
    withTestSuite(PYTEST_INI, passPytest);
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.status).toBe('pass');
  });

  test('detects "conftest.py" sentinel file', () => {
    withTestSuite(CONFTEST, passPytest);
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.status).toBe('pass');
  });

  test('detects [tool.pytest.ini_options] section in pyproject.toml', () => {
    withTestSuite(
      PYPROJECT,
      passPytest,
      '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n'
    );
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.status).toBe('pass');
  });

  test('detects [tool:pytest] section in setup.cfg', () => {
    withTestSuite(
      SETUP_CFG,
      passPytest,
      '[tool:pytest]\naddopts = -v\n'
    );
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.status).toBe('pass');
  });

  test('detects [pytest] section in tox.ini', () => {
    withTestSuite(
      TOX_INI,
      passPytest,
      '[pytest]\naddopts = -v\n'
    );
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.status).toBe('pass');
  });
});

// ===========================================================================
// runTests
// ===========================================================================

describe('runTests', () => {
  // All runTests tests need a test suite to exist so hasTestSuite() returns true.
  // We use TESTS_DIR as the sentinel for simplicity.
  beforeEach(() => {
    fs.existsSync.mockImplementation(p => p === TESTS_DIR);
  });

  test('returns pass (blocking) when pytest exits 0', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[0] === '-m' && args[1] === 'pytest') return { stdout: '5 passed\n', stderr: '', status: 0 };
      return { stdout: '', stderr: '', status: 0 };
    });
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.name).toBe('tests');
    expect(result.status).toBe('pass');
    expect(result.blocking).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('returns fail with parsed FAILED-line issues when pytest exits non-zero', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[0] === '-m' && args[1] === 'pytest') {
        return {
          stdout: 'FAILED tests/test_app.py::test_login - AssertionError: expected True\n1 failed\n',
          stderr: '',
          status: 1
        };
      }
      return { stdout: '', stderr: '', status: 0 };
    });
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.status).toBe('fail');
    expect(result.blocking).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].file).toBe('tests/test_app.py');
    expect(result.issues[0].rule).toBe('test-failure');
    expect(result.issues[0].message).toContain('AssertionError');
  });

  test('returns fail with generic "Tests failed" message when pytest exits non-zero with no FAILED lines', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[0] === '-m' && args[1] === 'pytest') {
        return { stdout: 'ERROR collecting tests/\n', stderr: '', status: 1 };
      }
      return { stdout: '', stderr: '', status: 0 };
    });
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.status).toBe('fail');
    expect(result.issues[0].rule).toBe('test-failure');
    expect(result.issues[0].message).toBe('Tests failed');
  });

  test('returns skipped when output contains "No module named pytest"', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[0] === '-m' && args[1] === 'pytest') {
        return { stdout: '', stderr: 'No module named pytest\n', status: 1 };
      }
      return { stdout: '', stderr: '', status: 0 };
    });
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.status).toBe('skipped');
    expect(result.blocking).toBe(false);
  });

  test('returns skipped when pytest output contains "no tests ran"', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[0] === '-m' && args[1] === 'pytest') {
        return { stdout: 'no tests ran\n', stderr: '', status: 5 };
      }
      return { stdout: '', stderr: '', status: 0 };
    });
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.status).toBe('skipped');
    expect(result.blocking).toBe(false);
  });

  test('returns fail/test-timeout when spawnSync returns an ETIMEDOUT error', () => {
    const timeoutErr = Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' });
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[0] === '-m' && args[1] === 'pytest') return { error: timeoutErr, stdout: '', stderr: '', status: null };
      return { stdout: '', stderr: '', status: 0 };
    });
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.status).toBe('fail');
    expect(result.issues[0].rule).toBe('test-timeout');
    expect(result.issues[0].message).toBe('Tests timed out after 60s');
  });

  test('returns fail/test-run-error when spawnSync returns a non-timeout error', () => {
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[0] === '-m' && args[1] === 'pytest') {
        return { error: new Error('spawn ENOENT'), stdout: '', stderr: '', status: null };
      }
      return { stdout: '', stderr: '', status: 0 };
    });
    const [result] = run(FAKE_PROJECT, ['tests']);
    expect(result.status).toBe('fail');
    expect(result.issues[0].rule).toBe('test-run-error');
    expect(result.issues[0].message).toBe('spawn ENOENT');
  });
});

// ===========================================================================
// run() — entry point
// ===========================================================================

describe('run() — entry point', () => {
  test('returns single python-not-found result when no interpreter is available', () => {
    spawnSync.mockImplementation((_cmd, args) => {
      if (args.includes('--version')) return { error: new Error('ENOENT'), stdout: '', stderr: '', status: 1 };
      return { stdout: '', stderr: '', status: 0 };
    });
    const results = run(FAKE_PROJECT, null);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('python');
    expect(results[0].status).toBe('fail');
    expect(results[0].issues[0].rule).toBe('python-not-found');
  });

  test('runs only the named check when a filter is provided', () => {
    const results = run(FAKE_PROJECT, ['syntax']);
    expect(results.map(r => r.name)).toEqual(['syntax']);
  });

  test('runs all four checks when filter is null', () => {
    fs.existsSync.mockImplementation(p => p === TESTS_DIR || p === REQ_PATH);
    fs.readFileSync.mockReturnValue('flask\n');
    spawnSync.mockImplementation((cmd, args) => {
      if (args.includes('--version')) return { stdout: 'Python 3.11.0\n', stderr: '', status: 0 };
      if (args[1] === 'import pyflakes') return { stdout: '', stderr: '', status: 0 };
      if (args[0] === '-c' && args[1] && args[1].includes('ast.parse')) {
        return { stdout: JSON.stringify([]), stderr: '', status: 0 };
      }
      if (args[0] === '-c' && args[1] && args[1].includes('importlib.util')) {
        return { stdout: JSON.stringify({ missing: [], third_party: ['flask'] }), stderr: '', status: 0 };
      }
      if (args[0] === '-m' && args[1] === 'pyflakes') return { stdout: '', stderr: '', status: 0 };
      if (args[0] === '-m' && args[1] === 'pytest') return { stdout: '1 passed\n', stderr: '', status: 0 };
      return { stdout: '', stderr: '', status: 0 };
    });
    const results = run(FAKE_PROJECT, null);
    expect(results.map(r => r.name)).toEqual(['syntax', 'imports', 'requirements', 'tests']);
    expect(results).toHaveLength(4);
  });

  test('skips runAstWalk when pyflakes is available and only imports is requested', () => {
    // needsRequirements=false, hasPyflakes=true → needsAst=false → no COMBINED_AST_SCRIPT call
    run(FAKE_PROJECT, ['imports']);
    const astCalls = spawnSync.mock.calls.filter(
      ([, args]) => args[0] === '-c' && args[1] && args[1].includes('importlib.util')
    );
    expect(astCalls).toHaveLength(0);
  });
});
