'use strict';

const path = require('path');

// jest.mock calls are hoisted before any require — must appear before the runner import.
jest.mock('child_process');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

const { spawnSync } = require('child_process');
const fs = require('fs');
const { run } = require('../src/runners/android');

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

// Fake Android project root. path.join produces OS-native separators so that
// path.relative() inside the runner returns correct relative paths on Windows.
const FAKE_PROJECT = path.join('C:', 'fake', 'android');
const GRADLEW_BAT  = path.join(FAKE_PROJECT, 'gradlew.bat');
const GRADLEW_SH   = path.join(FAKE_PROJECT, 'gradlew');
const LINT_REPORT  = path.join(FAKE_PROJECT, 'app', 'build', 'reports', 'lint-results-debug.xml');

// Minimal Gradle task list output that satisfies detectCompileTaskFromOutput() for AGP 8.x
const TASKS_AGP8 = 'app:compileDebugKotlin - Compiles the debug Kotlin source files.\n';

// Lint XML with no Error-severity issues (only a Warning)
const LINT_XML_CLEAN = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<issues format="6">',
  '<issue id="OldTargetApi" severity="Warning" message="Old API" category="C" priority="3" summary="s">',
  `<location file="${path.join(FAKE_PROJECT, 'app', 'build.gradle.kts')}" line="5" column="1"/>`,
  '</issue>',
  '</issues>'
].join('\n');

// Lint XML with one Error-severity issue
const LINT_XML_ERROR = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<issues format="6">',
  '<issue id="NullPointerException" severity="Error" message="Null check required" category="Correctness" priority="9" summary="NPE">',
  `<location file="${path.join(FAKE_PROJECT, 'app', 'src', 'main', 'Foo.kt')}" line="10" column="1"/>`,
  '</issue>',
  '</issues>'
].join('\n');

// ---------------------------------------------------------------------------
// Default mock wiring (reset before each test)
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // gradlew.bat present by default; lint XML report absent by default
  fs.existsSync.mockImplementation(p => p === GRADLEW_BAT);
  fs.readFileSync.mockReturnValue('');

  // Default spawnSync routing:
  //   tasks --all  → AGP8 output (so detectCompileTask finds app:compileDebugKotlin)
  //   everything else → BUILD SUCCESSFUL, exit 0
  spawnSync.mockImplementation((_cmd, args) => {
    if (Array.isArray(args) && args.includes('tasks')) {
      return { stdout: TASKS_AGP8, stderr: '', status: 0 };
    }
    return { stdout: 'BUILD SUCCESSFUL\n', stderr: '', status: 0 };
  });
});

// ---------------------------------------------------------------------------
// run() — entry-point behaviour
// ---------------------------------------------------------------------------

describe('run() — no gradle wrapper', () => {
  test('returns android fail when neither gradlew.bat nor gradlew is present', async () => {
    fs.existsSync.mockReturnValue(false);
    const results = await run(FAKE_PROJECT, null);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('android');
    expect(results[0].status).toBe('fail');
    expect(results[0].blocking).toBe(true);
    expect(results[0].issues[0].rule).toBe('no-gradle-wrapper');
  });

  test('finds gradle wrapper via Unix gradlew when gradlew.bat absent', async () => {
    fs.existsSync.mockImplementation(p => p === GRADLEW_SH);
    const results = await run(FAKE_PROJECT, ['compile']);
    // If getGradleCommand found gradlew, run() proceeds past the early-return;
    // compile returns a non-android check name.
    expect(results[0].name).toBe('compile');
    expect(spawnSync).toHaveBeenCalledWith('./gradlew', expect.any(Array), expect.any(Object));
    expect(results[0].status).not.toBe('fail');
  });
});

describe('run() — checks filter', () => {
  test('runs only the named check when a filter is provided', async () => {
    const results = await run(FAKE_PROJECT, ['compile']);
    const names = results.map(r => r.name);
    expect(names).toEqual(['compile']);
  });

  test('runs all four checks when filter is null', async () => {
    // lint needs a report to return anything other than warn/fail
    fs.existsSync.mockImplementation(p => p === GRADLEW_BAT || p === LINT_REPORT);
    fs.readFileSync.mockReturnValue(LINT_XML_CLEAN);
    const results = await run(FAKE_PROJECT, null);
    const names = results.map(r => r.name);
    expect(names).toContain('compile');
    expect(names).toContain('lint');
    expect(names).toContain('tests');
    expect(names).toContain('ktlint');
    expect(names).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// runCompile
// ---------------------------------------------------------------------------

describe('runCompile', () => {
  test('returns fail/compile-task-not-found when tasks --all has no known compile task', async () => {
    spawnSync.mockImplementation((_cmd, args) => {
      if (Array.isArray(args) && args.includes('tasks')) {
        return { stdout: 'assembleDebug - Assembles the debug build.\n', stderr: '', status: 0 };
      }
      return { stdout: 'BUILD SUCCESSFUL\n', stderr: '', status: 0 };
    });
    const [result] = await run(FAKE_PROJECT, ['compile']);
    expect(result.name).toBe('compile');
    expect(result.status).toBe('fail');
    expect(result.blocking).toBe(true);
    expect(result.issues[0].rule).toBe('compile-task-not-found');
  });

  test('returns pass when compile exits 0 with no e: error lines', async () => {
    const [result] = await run(FAKE_PROJECT, ['compile']);
    expect(result.name).toBe('compile');
    expect(result.status).toBe('pass');
    expect(result.issues).toHaveLength(0);
  });

  test('returns fail with kotlin-compile issues when e: lines are present', async () => {
    const errorLine =
      `e: ${path.join(FAKE_PROJECT, 'app', 'src', 'main', 'Foo.kt')}: (5, 3): Unresolved reference: bar`;
    spawnSync.mockImplementation((_cmd, args) => {
      if (Array.isArray(args) && args.includes('tasks')) {
        return { stdout: TASKS_AGP8, stderr: '', status: 0 };
      }
      if (Array.isArray(args) && args.some(a => a.includes('compileDebugKotlin'))) {
        return { stdout: '', stderr: errorLine + '\nBUILD FAILED\n', status: 1 };
      }
      return { stdout: 'BUILD SUCCESSFUL\n', stderr: '', status: 0 };
    });
    const [result] = await run(FAKE_PROJECT, ['compile']);
    expect(result.status).toBe('fail');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].rule).toBe('kotlin-compile');
    expect(result.issues[0].line).toBe(5);
    expect(result.issues[0].message).toContain('Unresolved reference');
  });

  test('returns fail/compile-failed when exit is non-zero but no e: lines present', async () => {
    spawnSync.mockImplementation((_cmd, args) => {
      if (Array.isArray(args) && args.includes('tasks')) {
        return { stdout: TASKS_AGP8, stderr: '', status: 0 };
      }
      if (Array.isArray(args) && args.some(a => a.includes('compileDebugKotlin'))) {
        return { stdout: 'FAILURE: Gradle daemon crashed\n', stderr: '', status: 1 };
      }
      return { stdout: 'BUILD SUCCESSFUL\n', stderr: '', status: 0 };
    });
    const [result] = await run(FAKE_PROJECT, ['compile']);
    expect(result.status).toBe('fail');
    expect(result.issues[0].rule).toBe('compile-failed');
    expect(result.issues[0].message).toContain('FAILURE');
  });
});

// ---------------------------------------------------------------------------
// runLint
// ---------------------------------------------------------------------------

describe('runLint', () => {
  test('returns fail/lint-report-missing when no XML report and lint exits non-zero', async () => {
    spawnSync.mockImplementation((_cmd, args) => {
      if (Array.isArray(args) && args.includes('lint')) {
        return { stdout: 'BUILD FAILED\n', stderr: '', status: 1 };
      }
      return { stdout: 'BUILD SUCCESSFUL\n', stderr: '', status: 0 };
    });
    // fs.existsSync default: no lint report
    const [result] = await run(FAKE_PROJECT, ['lint']);
    expect(result.name).toBe('lint');
    expect(result.status).toBe('fail');
    expect(result.blocking).toBe(true);
    expect(result.issues[0].rule).toBe('lint-report-missing');
  });

  test('returns warn/lint-report-missing when no XML report but lint exits 0', async () => {
    // Default spawnSync returns exit 0 for everything; no lint report present.
    const [result] = await run(FAKE_PROJECT, ['lint']);
    expect(result.name).toBe('lint');
    expect(result.status).toBe('warn');
    expect(result.blocking).toBe(true);
    expect(result.issues[0].rule).toBe('lint-report-missing');
  });

  test('returns pass when XML report exists and contains no Error issues', async () => {
    fs.existsSync.mockImplementation(p => p === GRADLEW_BAT || p === LINT_REPORT);
    fs.readFileSync.mockReturnValue(LINT_XML_CLEAN);
    const [result] = await run(FAKE_PROJECT, ['lint']);
    expect(result.name).toBe('lint');
    expect(result.status).toBe('pass');
    expect(result.blocking).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('returns fail with parsed issues when XML report contains Error issues', async () => {
    fs.existsSync.mockImplementation(p => p === GRADLEW_BAT || p === LINT_REPORT);
    fs.readFileSync.mockReturnValue(LINT_XML_ERROR);
    const [result] = await run(FAKE_PROJECT, ['lint']);
    expect(result.name).toBe('lint');
    expect(result.status).toBe('fail');
    expect(result.blocking).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].rule).toBe('NullPointerException');
    expect(result.issues[0].line).toBe(10);
    expect(result.issues[0].message).toContain('Null check required');
  });
});

// ---------------------------------------------------------------------------
// runTests
// ---------------------------------------------------------------------------

describe('runTests', () => {
  test('returns skipped (non-blocking) when output contains "No tests were found"', async () => {
    spawnSync.mockImplementation((_cmd, args) => {
      if (Array.isArray(args) && args.includes('test')) {
        return { stdout: 'No tests were found.\n', stderr: '', status: 1 };
      }
      return { stdout: 'BUILD SUCCESSFUL\n', stderr: '', status: 0 };
    });
    const [result] = await run(FAKE_PROJECT, ['tests']);
    expect(result.name).toBe('tests');
    expect(result.status).toBe('skipped');
    expect(result.blocking).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  test('returns pass (blocking) when test task exits 0', async () => {
    spawnSync.mockImplementation((_cmd, args) => {
      if (Array.isArray(args) && args.includes('test')) {
        return { stdout: 'BUILD SUCCESSFUL\n', stderr: '', status: 0 };
      }
      return { stdout: 'BUILD SUCCESSFUL\n', stderr: '', status: 0 };
    });
    const [result] = await run(FAKE_PROJECT, ['tests']);
    expect(result.name).toBe('tests');
    expect(result.status).toBe('pass');
    expect(result.blocking).toBe(true);
  });

  test('returns fail (blocking) with test-failure issue when test task exits non-zero', async () => {
    spawnSync.mockImplementation((_cmd, args) => {
      if (Array.isArray(args) && args.includes('test')) {
        return { stdout: 'FAILURE: 2 tests failed\n', stderr: '', status: 1 };
      }
      return { stdout: 'BUILD SUCCESSFUL\n', stderr: '', status: 0 };
    });
    const [result] = await run(FAKE_PROJECT, ['tests']);
    expect(result.name).toBe('tests');
    expect(result.status).toBe('fail');
    expect(result.blocking).toBe(true);
    expect(result.issues[0].rule).toBe('test-failure');
    expect(result.issues[0].message).toContain('FAILURE');
  });
});

// ---------------------------------------------------------------------------
// runKtlint
// ---------------------------------------------------------------------------

describe('runKtlint', () => {
  test('returns skipped (non-blocking) when ktlintCheck task is not found', async () => {
    spawnSync.mockImplementation((_cmd, args) => {
      if (Array.isArray(args) && args.includes('ktlintCheck')) {
        return { stdout: "Task 'ktlintCheck' not found in project ':app'.\n", stderr: '', status: 1 };
      }
      return { stdout: 'BUILD SUCCESSFUL\n', stderr: '', status: 0 };
    });
    const [result] = await run(FAKE_PROJECT, ['ktlint']);
    expect(result.name).toBe('ktlint');
    expect(result.status).toBe('skipped');
    expect(result.blocking).toBe(false);
  });

  test('returns pass (non-blocking) when ktlintCheck exits 0 with no violations', async () => {
    spawnSync.mockImplementation((_cmd, args) => {
      if (Array.isArray(args) && args.includes('ktlintCheck')) {
        return { stdout: 'BUILD SUCCESSFUL\n', stderr: '', status: 0 };
      }
      return { stdout: 'BUILD SUCCESSFUL\n', stderr: '', status: 0 };
    });
    const [result] = await run(FAKE_PROJECT, ['ktlint']);
    expect(result.name).toBe('ktlint');
    expect(result.status).toBe('pass');
    expect(result.blocking).toBe(false);
    expect(result.issues).toHaveLength(0);
  });

  test('returns warn (non-blocking) with ktlint issues when .kt violation lines present', async () => {
    const violation =
      `${path.join(FAKE_PROJECT, 'app', 'src', 'main', 'Foo.kt')}:5:1: Missing newline before "}"`;
    spawnSync.mockImplementation((_cmd, args) => {
      if (Array.isArray(args) && args.includes('ktlintCheck')) {
        return { stdout: violation + '\nBUILD FAILED\n', stderr: '', status: 1 };
      }
      return { stdout: 'BUILD SUCCESSFUL\n', stderr: '', status: 0 };
    });
    const [result] = await run(FAKE_PROJECT, ['ktlint']);
    expect(result.name).toBe('ktlint');
    expect(result.status).toBe('warn');
    expect(result.blocking).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].line).toBe(5);
    expect(result.issues[0].rule).toBe('ktlint');
    expect(result.issues[0].message).toContain('Missing newline');
  });
});
