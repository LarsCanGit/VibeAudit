'use strict';

const chalk = require('chalk');
const { version } = require('../package.json');

const STATUS_ICONS = {
  pass: chalk.green('✓'),
  fail: chalk.red('✗'),
  warn: chalk.yellow('⚠'),
  skipped: chalk.gray('–')
};

const STATUS_COLORS = {
  pass: chalk.green,
  fail: chalk.red,
  warn: chalk.yellow,
  skipped: chalk.gray
};

function formatTerminal(results, stack) {
  const lines = [];
  lines.push(chalk.bold(`\nVibeAudit v${version} — stack: ${stack}\n`));

  for (const check of results) {
    const icon = STATUS_ICONS[check.status] || '?';
    const colorFn = STATUS_COLORS[check.status] || (s => s);
    let suffix;
    if (check.status === 'skipped') {
      suffix = chalk.gray('  skipped');
    } else if (!check.blocking) {
      suffix = `  ${chalk.gray(check.duration_ms + 'ms')}` + chalk.gray(' [non-blocking]');
    } else {
      suffix = `  ${chalk.gray(check.duration_ms + 'ms')}`;
    }
    lines.push(`  ${icon} ${colorFn(check.name)}${suffix}`);

    const capped = check.issues.slice(0, 10);
    for (const issue of capped) {
      const location = issue.file ? `${issue.file}:${issue.line}` : '';
      const rule = issue.rule ? chalk.gray(`[${issue.rule}]`) : '';
      lines.push(`      ${location ? chalk.cyan(location) + ' ' : ''}${rule} ${issue.message}`);
    }
    if (check.issues.length > 10) {
      lines.push(chalk.gray(`      ... and ${check.issues.length - 10} more issues`));
    }
  }

  const hasBlockingFail = results.some(r => r.blocking && r.status === 'fail');
  const overall = hasBlockingFail ? chalk.red.bold('FAIL') : chalk.green.bold('PASS');
  lines.push(`\n  Result: ${overall}\n`);

  return lines.join('\n');
}

function buildJsonPayload(results, stack) {
  const hasBlockingFail = results.some(r => r.blocking && r.status === 'fail');
  return {
    vibeaudit: version,
    stack,
    result: hasBlockingFail ? 'fail' : 'pass',
    blocking: hasBlockingFail,
    checks: results
  };
}

function format(results, options) {
  const { json = false, stack = 'unknown' } = options || {};
  const payload = buildJsonPayload(results, stack);

  if (json) {
    return JSON.stringify(payload, null, 2);
  }

  const terminal = formatTerminal(results, stack);
  const jsonBlock = '```json\n' + JSON.stringify(payload, null, 2) + '\n```';
  return terminal + '\n' + jsonBlock;
}

module.exports = { format };
