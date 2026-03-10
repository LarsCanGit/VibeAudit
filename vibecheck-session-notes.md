# VibeCheck — Session Notes
**Date: March 8, 2026 · First full dev session**

---

## What Got Built Today

Starting from zero, ending with a working pre-alpha CLI:

- Node/JS runner — ESLint, npm-audit, test runner auto-detection
- Android/Kotlin runner — compile (AGP version-agnostic), lint (XML parsing), tests, ktlint
- 28 passing tests (13 node integration + 12 android parser snapshots + 3 AGP detection)
- Self-dogfood loop working — `vibecheck` checks itself cleanly on every run
- Validated against a real Android project (Keep Momentum) on first full run

---

## Bugs Caught by VibeCheck Today

### In Keep Momentum (real project)
- `MissingPermission` — `NotificationHelper.kt:112` — notification call without
  permission check or SecurityException handler. Never surfaced by Android Studio.
  Fixed and shipped same session.

### In VibeCheck itself (self-dogfood)
- Silent false pass on compile — `compileDebugKotlinSources` task not found in
  AGP 8.x, but no `e:` lines in output so parser returned `pass`. Fixed by
  auto-detecting the correct task name via `gradlew tasks --all`.

---

## Hard-Won Lessons

### Process management
- **Never use Jest `--watch` mode.** VibeCheck spawns child processes per check.
  Watch mode reruns on every save, compounds subprocesses, and will OOM the machine.
  VS Code crashed twice today from this.
- **Always use `spawnSync` not `spawn`.** Async spawning without careful cleanup
  leaks processes. `spawnSync` blocks until done — slower but safe.
- **The self-dogfood fork bomb.** VibeCheck detects `"test": "jest"` in its own
  `package.json` and tries to run it, which runs VibeCheck, which runs Jest, forever.
  Fixed with a self-detection guard in `runTests()` that skips tests when
  `targetPath === VIBECHECK_ROOT`.

### Windows specifics
- Use `gradlew.bat` not `gradlew` on Windows. Always `shell: true` for Gradle.
- `2>&1 >file.txt` does not capture all streams in Windows cmd. Use `*>file.txt`
  in PowerShell instead.
- Node.js CLI via npm (`npm install -g`) is the right distribution mechanism —
  avoids Python packaging hell and works natively on Windows without extra setup.
- `npm link` is active — `vibecheck` is a live symlink to the repo. No reinstall
  needed after edits.

### ESLint / fixture isolation
- Test fixtures with deliberate errors must be excluded from the self-dogfood
  ESLint scan via `.eslintignore`. But `.eslintignore` also prevents the fixture
  runner from seeing errors. Fix: give each fixture its own `.eslintrc.json`
  scoped to the rules it tests. Root ignore keeps self-check clean; fixture
  config enables the fixture to fail correctly.

### Android / Gradle
- `compileDebugKotlinSources` is AGP 7.x. `app:compileDebugKotlin` is AGP 8.x.
  Never hardcode either. Use `gradlew tasks --all` to auto-detect at runtime.
  Add ~1-2s overhead but eliminates silent false passes across AGP versions.
- Kotlin compiler errors go to **stderr**, not stdout. Parse stderr for `e:` lines.
- Lint errors go to an **XML report file**, not stdout. Parse
  `app/build/reports/lint-results-debug.xml`. Only surface `severity="Error"` —
  warnings are noise for a blocking check.
- Gradle cold start can be 3-5 minutes. Do not kill it. Warm cache is 2-20s.
- `tasks --all` adds ~1-2s on warm cache. Worth it for AGP version safety.

### Testing strategy
- **Integration tests for the node runner** — spawn the real CLI against real
  fixtures, assert on JSON output. Slow (~5s) but tests the whole stack.
- **Snapshot/parser tests for the Android runner** — extract pure parser functions,
  test them against captured Gradle output as text fixtures. Fast, no SDK needed.
- **Never mock the filesystem or runners** in integration tests — you'll miss the
  real failure modes.
- **Never snapshot terminal output** — colored text is fragile. Test JSON only.
- JSON block is always present in stdout regardless of `--json` flag. Parse by
  finding the first `{` in stdout — robust against color codes and terminal noise.

### Output contract
- JSON envelope `blocking` field must reflect whether any blocking check is in a
  non-pass state (fail OR skipped). A skipped blocking check = unknown = blocking.
- `skipped` and `non-blocking` are different states. Skipped checks render as
  `– <name>  skipped` with no duration and no `[non-blocking]` label.
- Exit code 0 = all blocking checks pass. Exit code 1 = any blocking check fails.
  Exit code 2 = VibeCheck config error.

---

## Current State

### What works
- `vibecheck` — self-check, exits 0
- `vibecheck --path <android-project>` — full android run, all 4 checks
- `vibecheck --checks compile,lint` — selective checks
- `vibecheck --json` — agent-readable output only
- `npm test` — 28/28

### What's skipped/not yet built
- Tests check in self-dogfood run — skipped by design (fork bomb prevention)
- ktlint — skipped on Keep Momentum (not configured in that project)
- VS Code / Cursor extension — Phase 3, demand-gated
- Web dashboard / auth / paid tiers — not started
- Python, Rust runners — not started
- GitHub Action wrapper — next logical step
- npm publish prep — next logical step

---

## Next Session Options

1. **GitHub Action wrapper** — thin shell around the CLI core, gates CI/CD deploys
2. **npm publish prep** — package.json polish, README, `.npmignore`, dry-run publish
3. **Python runner** — adds a third stack
4. **Web dashboard MVP** — only needed once paid tiers exist

Recommended order: npm publish prep → GitHub Action → Python runner.
Get something installable before adding stacks.
