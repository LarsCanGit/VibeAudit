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

function formatTerminal(results, stack, warnings) {
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

  if (warnings && warnings.length > 0) {
    lines.push('');
    for (const w of warnings) {
      lines.push(`  ${chalk.yellow('⚠')} ${chalk.yellow('warning:')} ${w}`);
    }
  }

  const hasBlockingFail = results.some(r => r.blocking && r.status === 'fail');
  const overall = hasBlockingFail ? chalk.red.bold('FAIL') : chalk.green.bold('PASS');
  lines.push(`\n  Result: ${overall}\n`);

  return lines.join('\n');
}

function buildJsonPayload(results, stack, warnings) {
  const hasBlockingFail = results.some(r => r.blocking && r.status === 'fail');
  const payload = {
    vibeaudit: version,
    stack,
    result: hasBlockingFail ? 'fail' : 'pass',
    blocking: hasBlockingFail,
    checks: results
  };
  if (warnings && warnings.length > 0) {
    payload.warnings = warnings;
  }
  return payload;
}

function format(results, options) {
  const { json = false, human = false, stack = 'unknown', warnings = [] } = options || {};
  const payload = buildJsonPayload(results, stack, warnings);

  if (json) {
    return JSON.stringify(payload, null, 2);
  }

  const terminal = formatTerminal(results, stack, warnings);
  if (human) {
    return terminal;
  }

  const jsonBlock = JSON.stringify(payload, null, 2);
  return terminal + '\n' + jsonBlock;
}

module.exports = { format };
