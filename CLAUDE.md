# VibeAudit — Claude Code Context

## What This Project Is
A Node.js CLI tool that QA's AI-generated code before it's committed.
Designed to be run by either a human developer or an AI agent (Claude Code, Cursor, etc.).
The tool checks itself (node runner) and will add an Android/Kotlin runner next.

## Current Status
- Node/JS runner: in progress
- Android/Kotlin runner: in progress. Runner has been validated against a real project, and caught a real issue on the first run. 
- Web dashboard / auth / paid tiers: explicitly out of scope until CLI is validated

## Installation
`npm link` is active — `vibeaudit` command is a live symlink to this repo.
Do not run `npm install -g vibeaudit`. Changes to source files are immediately live.

## Architecture Decisions — Do Not Re-Litigate Without Good Reason
- CommonJS modules, not ESM (Windows shebang compat)
- Plain JavaScript, not TypeScript (add later)
- No web framework — this is a CLI, not a server
- JSON output block is ALWAYS appended to stdout, even on pass, even without --json flag
  The --json flag suppresses terminal output only — agents rely on JSON always being present
- Exit code 0 = all blocking checks pass, 1 = any blocking check fails, 2 = config error
- eslint and tests are blocking; npm-audit is non-blocking (warn only)
- ktlint will be non-blocking when Android runner is added

## Output Contract — Critical
Every run must produce:
1. Human-readable terminal summary (colored, issues capped at 10 per check)
2. JSON block at end of stdout in this shape:
   { "vibeaudit": "0.1.0", "stack": "node", "result": "pass|fail",
     "blocking": true|false, "checks": [...] }
The JSON block must be parseable by an agent without any pre-processing or stripping.

## Stack Detection Order
build.gradle → android | package.json → node
If multiple sentinels found, run all matching runners.

## Dependencies — Keep Minimal
Current: chalk (terminal color), commander (arg parsing), eslint (devDep)
Do not add dependencies without a clear reason. No web servers, no ORMs, no auth libs.

## Self-Dogfood Requirement
VibeAudit must be able to run against its own repo and return valid output.
The node runner runs on vibeaudit/ itself. This is the primary test before any release.
Running: node bin/vibeaudit.js (from project root) must always pass cleanly.

## File Layout
bin/vibeaudit.js          — CLI entry, arg parsing, orchestration
src/detector.js           — stack detection from filesystem sentinels
src/formatter.js          — terminal + JSON output
src/runners/index.js      — runner registry
src/runners/node.js       — Node/JS/TS checks (eslint, npm-audit, tests)
src/runners/android.js    — Android/Kotlin checks (NOT YET WRITTEN)
test/fixtures/            — sample projects per stack for testing

## Android Runner — Implemented
File: src/runners/android.js
Checks: compile (blocking), lint (blocking), tests (blocking), ktlint (non-blocking)
Sentinels: build.gradle OR build.gradle.kts (KTS projects like Momentum-New use .kts)
Requires: gradlew.bat (Windows) or gradlew (Unix) present in target project root

### Kotlin compile task name — critical
Use `app:compileDebugKotlin`, NOT `compileDebugKotlinSources`.
`compileDebugKotlinSources` was removed in AGP 8.x / Gradle 9.x. It fails silently:
Gradle prints BUILD FAILED to stdout but produces no `e:` lines, so the parser
returns `pass` even though the build never ran. This is a silent false pass — the
worst kind of bug. The correct task is `app:compileDebugKotlin`.

## Never Do These Things
- Do not add `--watch` or watch mode to any test script — this tool spawns child
  processes per test; watch mode compounds them on every save and will crash VS Code
- Do not add TypeScript compilation — plain JS only for now
- Do not add a web server, REST API, or database connection
- Do not install dependencies without a clear reason
- Do not refactor toward mocking to speed things up