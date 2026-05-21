# VibeAudit

**Commit, vibeaudit, push.**

Pre-push QA for AI-generated code. One command that runs the right checks for your stack, returns structured output readable by both humans and AI agents, and exits non-zero if anything blocking fails.

## Install

```bash
npm install -g @lmhansen/vibeaudit
```

## Usage

```bash
# Run in current directory (auto-detects project type)
vibeaudit

# Run against a specific path
vibeaudit --path ./my-project

# Run specific checks only
vibeaudit --checks syntax,tests

# Agent-readable JSON output only
vibeaudit --json

# Terminal output only (no JSON block)
vibeaudit --human
```

### Options

| Option | Description |
|--------|-------------|
| `--path <dir>` | Target directory to audit (default: current working directory) |
| `--checks <list>` | Comma-separated list of checks to run. If omitted, all checks for the detected stack run. |
| `--json` | Emit JSON only — suppresses the terminal summary. Useful for agents and CI pipelines that parse stdout. |
| `--human` | Emit terminal summary only — suppresses the JSON block. Useful for interactive use where the JSON is noise. |
| `--version` | Print the installed version and exit. |

**Check names by stack:**

| Stack | Check names |
|-------|-------------|
| Node | `eslint`, `npm-audit`, `tests` |
| Android | `compile`, `lint`, `tests`, `ktlint` |
| Python | `syntax`, `imports`, `requirements`, `tests` |

## What it checks

| Stack | Checks |
|-------|--------|
| Node / JS / TS | ESLint (blocking), npm audit (non-blocking), test runner (blocking) |
| Android / Kotlin | Compile (blocking), lint (blocking), tests (blocking), ktlint (non-blocking) |
| Python | Syntax — AST-based (blocking), imports — pyflakes or AST fallback (blocking), requirements.txt coverage (non-blocking), pytest (blocking) |

Auto-detects project type from `package.json`, `build.gradle`, `build.gradle.kts`, or `.py` files. Scans one level of subdirectories for monorepo sub-projects. No config needed for the happy path.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | All blocking checks pass |
| 1 | One or more blocking checks failed |
| 2 | VibeAudit configuration error |

## GitHub Action

Add to `.github/workflows/vibeaudit.yml`:

```yaml
name: VibeAudit
on:
  push:
    branches:
      - '**'
jobs:
  vibeaudit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: LarsCanGit/VibeAudit@main
```

Fails the workflow if any blocking check fails. Exit code 1 = blocking failure.

> **Note:** Android/Kotlin projects require the Android SDK and Gradle in CI. This is not provided by the default `ubuntu-latest` runner. The Action is primarily useful for Node/JS projects in v0.1. Android CI support is on the roadmap.

## Why VibeAudit

Vibe coding tools generate code fast but don't validate it. VibeAudit inserts a gate between "looks good" and "commit". One command, structured output, agent-readable JSON so Claude Code / Cursor can self-correct without hand-holding.

---

*VibeAudit v0.2 was QA'd by VibeAudit itself before publishing.*
