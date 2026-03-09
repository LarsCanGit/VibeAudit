# VibeAudit

A CLI tool that QAs AI-generated code before it's committed — runs stack-aware checks and returns structured output readable by both humans and AI agents.

## Install

```bash
npm install -g vibeaudit
```

## Usage

```bash
# Check current directory
vibeaudit

# Check a specific directory
vibeaudit --path <dir>

# Output JSON only (no terminal formatting)
vibeaudit --json

# Run specific checks only
vibeaudit --checks eslint,tests
```

## What it checks (node stack)

| Check | Blocking | Description |
|-------|----------|-------------|
| `eslint` | yes | Lint errors using project or inherited ESLint config |
| `npm-audit` | no (warn) | High/critical vulnerabilities in dependencies |
| `tests` | yes | Runs `npm test` if a test script is defined; skips otherwise |

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | All blocking checks passed |
| `1` | One or more blocking checks failed |
