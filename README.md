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
vibeaudit --checks compile,lint

# Agent-readable JSON output only
vibeaudit --json
```

## What it checks

| Stack | Checks |
|-------|--------|
| Node / JS / TS | ESLint, npm audit, test runner |
| Android / Kotlin | Compile (AGP version-agnostic), lint, ktlint, tests |

Auto-detects project type from `package.json`, `build.gradle`, or `build.gradle.kts`. No config needed for the happy path.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | All blocking checks pass |
| 1 | One or more blocking checks failed |
| 2 | VibeAudit configuration error |

## Why VibeAudit

Vibe coding tools generate code fast but don't validate it. VibeAudit inserts a gate between "looks good" and "commit". One command, structured output, agent-readable JSON so Claude Code / Cursor can self-correct without hand-holding.

---

*VibeAudit v0.1 was QA'd by VibeAudit itself before publishing.*
