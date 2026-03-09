'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function getGradleCommand(targetPath) {
  const bat = path.join(targetPath, 'gradlew.bat');
  const sh = path.join(targetPath, 'gradlew');
  if (fs.existsSync(bat)) return { cmd: bat, shell: true };
  if (fs.existsSync(sh)) return { cmd: './gradlew', shell: true };
  return null;
}

// Pure parser functions — exported for testing only

function detectCompileTaskFromOutput(output) {
  if (output.includes('app:compileDebugKotlin') ||
      output.includes(':compileDebugKotlin')) {
    return 'app:compileDebugKotlin';
  }
  if (output.includes('compileDebugKotlinSources')) {
    return 'compileDebugKotlinSources';
  }
  return null;
}

function detectCompileTask(targetPath, gradle) {
  const result = spawnSync(
    gradle.cmd,
    ['tasks', '--all'],
    { cwd: targetPath, encoding: 'utf8', shell: gradle.shell, timeout: 30000 }
  );
  const output = (result.stdout || '') + (result.stderr || '');
  return detectCompileTaskFromOutput(output);
}

function parseCompileOutput(output, targetPath) {
  const issues = [];
  for (const line of output.split('\n')) {
    // Kotlin compiler errors: e: <filepath>: (<line>, <col>): <message>
    const match = line.match(/^e: (.+?):\s*\((\d+),\s*\d+\):\s*(.+)$/);
    if (match) {
      issues.push({
        file: path.relative(targetPath, match[1].trim()),
        line: parseInt(match[2], 10),
        rule: 'kotlin-compile',
        message: match[3].trim()
      });
    }
  }
  return issues;
}

function parseLintXml(xml, targetPath) {
  const issues = [];
  const issueBlockRe = /<issue\b([^>]*)>([\s\S]*?)<\/issue>/g;
  let issueMatch;
  while ((issueMatch = issueBlockRe.exec(xml)) !== null) {
    const attrs = issueMatch[1];
    const body = issueMatch[2];
    const severityMatch = attrs.match(/severity="([^"]*)"/);
    if (!severityMatch || severityMatch[1] !== 'Error') continue;
    const idMatch = attrs.match(/\bid="([^"]*)"/);
    const msgMatch = attrs.match(/\bmessage="([^"]*)"/);
    const locMatch = body.match(/<location\b[^>]*\bfile="([^"]*)"[^>]*\bline="([^"]*)"[^>]*\/>/);
    issues.push({
      file: locMatch ? path.relative(targetPath, locMatch[1]) : '',
      line: locMatch ? parseInt(locMatch[2], 10) : 0,
      rule: idMatch ? idMatch[1] : 'lint',
      message: msgMatch ? msgMatch[1].replace(/&#xA;/g, ' ').trim() : ''
    });
  }
  return issues;
}

function runCompile(targetPath, gradle) {
  const start = Date.now();

  const task = detectCompileTask(targetPath, gradle);
  if (!task) {
    return {
      name: 'compile',
      status: 'fail',
      blocking: true,
      duration_ms: Date.now() - start,
      issues: [{
        file: '',
        line: 0,
        rule: 'compile-task-not-found',
        message: 'No Kotlin compile task found. Run `gradlew tasks --all` to inspect available tasks.'
      }]
    };
  }

  const result = spawnSync(
    gradle.cmd,
    [task],
    { cwd: targetPath, encoding: 'utf8', shell: gradle.shell, timeout: 120000 }
  );

  const output = (result.stderr || '') + (result.stdout || '');
  const issues = parseCompileOutput(output, targetPath);

  // If no e: lines found but Gradle still failed, surface a generic error
  // to prevent a silent false pass (e.g. daemon crash, OOM, misconfigured project)
  if (issues.length === 0 && result.status !== 0) {
    const firstLine = output.split('\n').find(l => l.trim().length > 0) || 'Compile failed';
    issues.push({ file: '', line: 0, rule: 'compile-failed', message: firstLine.trim() });
  }

  return {
    name: 'compile',
    status: issues.length > 0 ? 'fail' : 'pass',
    blocking: true,
    duration_ms: Date.now() - start,
    issues
  };
}

function runLint(targetPath, gradle) {
  const start = Date.now();

  const lintResult = spawnSync(
    gradle.cmd,
    ['lint'],
    { cwd: targetPath, encoding: 'utf8', shell: gradle.shell, timeout: 120000 }
  );

  // Find the lint XML report
  const reportPaths = [
    path.join(targetPath, 'app/build/reports/lint-results-debug.xml'),
    path.join(targetPath, 'app/build/reports/lint-results.xml')
  ];
  const reportPath = reportPaths.find(p => fs.existsSync(p));

  if (!reportPath) {
    // Non-zero exit with no report means lint failed to run (not just found errors)
    return {
      name: 'lint',
      status: lintResult.status !== 0 ? 'fail' : 'warn',
      blocking: true,
      duration_ms: Date.now() - start,
      issues: [{ file: '', line: 0, rule: 'lint-report-missing', message: 'Lint XML report not found' }]
    };
  }

  const xml = fs.readFileSync(reportPath, 'utf8');
  const issues = parseLintXml(xml, targetPath);

  return {
    name: 'lint',
    status: issues.length > 0 ? 'fail' : 'pass',
    blocking: true,
    duration_ms: Date.now() - start,
    issues
  };
}

function runTests(targetPath, gradle) {
  const start = Date.now();

  const result = spawnSync(
    gradle.cmd,
    ['test'],
    { cwd: targetPath, encoding: 'utf8', shell: gradle.shell, timeout: 120000 }
  );

  const output = (result.stdout || '') + (result.stderr || '');

  if (output.includes('No tests were found')) {
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

  const errText = output.trim().split('\n').find(l => l.trim().length > 0) || 'Tests failed';
  return {
    name: 'tests',
    status: 'fail',
    blocking: true,
    duration_ms: Date.now() - start,
    issues: [{ file: '', line: 0, rule: 'test-failure', message: errText.trim() }]
  };
}

function runKtlint(targetPath, gradle) {
  const start = Date.now();

  const result = spawnSync(
    gradle.cmd,
    ['ktlintCheck'],
    { cwd: targetPath, encoding: 'utf8', shell: gradle.shell, timeout: 60000 }
  );

  const output = (result.stdout || '') + (result.stderr || '');

  if (output.includes("Task 'ktlintCheck' not found")) {
    return {
      name: 'ktlint',
      status: 'skipped',
      blocking: false,
      duration_ms: Date.now() - start,
      issues: []
    };
  }

  const issues = [];
  for (const line of output.split('\n')) {
    // ktlint violation lines typically look like: /path/file.kt:10:1: Unexpected...
    const match = line.match(/^(.+\.kt):(\d+):\d+:\s*(.+)$/);
    if (match) {
      issues.push({
        file: path.relative(targetPath, match[1]),
        line: parseInt(match[2], 10),
        rule: 'ktlint',
        message: match[3].trim()
      });
    }
  }

  return {
    name: 'ktlint',
    status: issues.length > 0 ? 'warn' : 'pass',
    blocking: false,
    duration_ms: Date.now() - start,
    issues
  };
}

async function run(targetPath, checks) {
  const gradle = getGradleCommand(targetPath);

  if (!gradle) {
    return [{
      name: 'android',
      status: 'fail',
      blocking: true,
      duration_ms: 0,
      issues: [{ file: '', line: 0, rule: 'no-gradle-wrapper',
        message: 'No Gradle wrapper found. Run this from an Android project root.' }]
    }];
  }

  const checkDefs = [
    { name: 'compile', fn: () => runCompile(targetPath, gradle) },
    { name: 'lint',    fn: () => runLint(targetPath, gradle) },
    { name: 'tests',   fn: () => runTests(targetPath, gradle) },
    { name: 'ktlint',  fn: () => runKtlint(targetPath, gradle) }
  ];

  const results = [];
  for (const { name, fn } of checkDefs) {
    if (!checks || checks.includes(name)) {
      results.push(fn());
    }
  }

  return results;
}

module.exports = { run, parseCompileOutput, parseLintXml, detectCompileTaskFromOutput };
