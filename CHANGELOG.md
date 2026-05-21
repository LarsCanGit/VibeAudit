# Changelog

## [0.2.0] — 2026-04-30

### Added
- **Python runner** (`src/runners/python.js`): four checks for Python projects
  - `syntax` (blocking): AST-based syntax check across all `.py` files
  - `imports` (blocking): unresolved import detection via pyflakes or `importlib.util` fallback
  - `requirements` (non-blocking): cross-references third-party imports against `requirements.txt`
  - `tests` (blocking): runs `pytest -q --tb=line` when a test suite is detected
- **Depth-1 stack detection** (`src/detector.js`): scans one level of subdirectories so monorepo
  sub-projects are detected and run with the correct project root
- `IMPORT_TO_PACKAGE` remapping table in Python runner handles common import/package name
  mismatches (e.g. `PIL` → `pillow`, `cv2` → `opencv-python`, `sklearn` → `scikit-learn`)

### Changed
- `src/detector.js`: returns `[{stack, path}]` objects instead of a flat string array; each
  detected project carries its own path for correct runner dispatch
- `src/runners/index.js`: `getRunners()` now returns `{runner, path}` pairs so each runner
  receives its actual project root
- `bin/vibeaudit.js`: consumes path-aware pairs; stack label deduplicates across detected paths
- Python detection via `.py` files is now suppressed when another stack (`node`, `android`) is
  already detected at the same path — prevents false positives on Node/Android projects with
  stray Python scripts

### Fixed
- `findPython()` now rejects Python 2 interpreters; prefers `python3` over `python`
- `runTests()` reports a `test-timeout` rule (not a generic "Tests failed") when pytest exceeds
  the 60 s timeout
- `COLLECT_IMPORTS_SCRIPT` now filters local module names to prevent false-positive
  `missing-requirement` warnings for project-local files
- All inline Python scripts now skip `env/` directories (common `python -m venv env` name) in
  addition to `.venv/` and `venv/`

## [0.1.2] — initial

- Node/JS runner: eslint (blocking), npm-audit (non-blocking), tests (blocking)
- Android/Kotlin runner: compile (blocking), lint (blocking), tests (blocking), ktlint (non-blocking)
- Auto stack detection from `package.json` / `build.gradle`
- JSON output block always appended to stdout for agent consumption
