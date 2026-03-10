# npm Publish Prep — vibeaudit

Get the package ready for a first publish to npm. This is pre-launch polish, not
feature work. Do not change behaviour, refactor logic, or add checks. The goal is
a clean, professional package that installs correctly for a stranger on any platform.

---

## 1. `package.json` — required fields

Ensure the following fields are present and correct:

```json
{
  "name": "vibeaudit",
  "version": "0.1.0",
  "description": "Pre-push QA for AI-generated code. Commit, vibeaudit, push.",
  "license": "MIT",
  "keywords": ["vibe-coding", "ai", "lint", "qa", "cli", "android", "kotlin", "eslint"],
  "homepage": "https://getvibeaudit.com",
  "repository": {
    "type": "git",
    "url": "https://github.com/LarsCanGit/vibeaudit"
  },
  "bugs": {
    "url": "https://github.com/LarsCanGit/vibeaudit/issues"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "bin": {
    "vibeaudit": "./bin/vibeaudit.js"
  }
}
```

- Confirm the `bin` path matches the actual entrypoint file
- Confirm `"main"` is set if anything imports the package programmatically
- Remove any `"private": true` if present

---

## 2. `LICENSE`

If a `LICENSE` file doesn't exist, create one — MIT, copyright Lars, 2026.

---

## 3. `.npmignore`

Create `.npmignore` to exclude everything that shouldn't ship to npm users:

```
# Dev and test
test/
tests/
fixtures/
*.test.js
*.spec.js
jest.config.*
.eslintrc*
.eslintignore

# Docs and project management
*.md
!README.md
docs/

# Dev tooling
.vscode/
.idea/
.npmignore
CLAUDE.md

# Misc
.DS_Store
*.log
coverage/
.nyc_output/
```

After creating `.npmignore`, run:
```
npm pack --dry-run
```

Review the file list. It should contain only runtime files: the bin entrypoint,
source files, `package.json`, `README.md`, and `LICENSE`. If anything unexpected
appears, add it to `.npmignore`. If anything expected is missing, remove the
exclusion rule.

---

## 4. README.md

Create `README.md` if it doesn't exist. Keep it tight — this is v0.1.

### Required sections:

**Header**
- Name: VibeAudit
- Tagline: "Commit, vibeaudit, push."
- One-sentence description: Pre-push QA for AI-generated code.

**Install**
```bash
npm install -g vibeaudit
```

**Usage**
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

**What it checks**

| Stack | Checks |
|-------|--------|
| Node / JS / TS | ESLint, npm audit, test runner |
| Android / Kotlin | Compile (AGP version-agnostic), lint, ktlint, tests |

Auto-detects project type from `package.json`, `build.gradle`, `requirements.txt`,
`pyproject.toml`, or `Cargo.toml`. No config needed for the happy path.

**Exit codes**

| Code | Meaning |
|------|---------|
| 0 | All blocking checks pass |
| 1 | One or more blocking checks failed |
| 2 | VibeAudit configuration error |

**Why VibeAudit**
Short paragraph: vibe coding tools generate code fast but don't validate it.
VibeAudit inserts a gate between "looks good" and "commit". One command, structured
output, agent-readable JSON so Claude Code / Cursor can self-correct without
hand-holding.

**Dogfood note**
"VibeAudit v0.1 was QA'd by VibeAudit itself before publishing."

---

## 5. Bin entrypoint

Ensure the bin file has a proper shebang as its first line:
```javascript
#!/usr/bin/env node
```

Ensure the file has execute permissions:
```bash
chmod +x ./bin/vibeaudit.js
```

(npm handles this on install, but it should be correct in the repo.)

---

## 6. Dry-run publish

```bash
npm pack --dry-run
```

Verify:
- File list looks correct (no test fixtures, no CLAUDE.md, no session notes)
- Package size is reasonable (should be well under 1MB)
- No missing files that are needed at runtime

Then do a local install test from the tarball:
```bash
npm pack
npm install -g vibeaudit-0.1.0.tgz
vibeaudit
vibeaudit --path <android-project-path>
npm uninstall -g vibeaudit
```

If the tarball install works end-to-end, the package is ready to publish.

---

## 7. npm account prep

Before publishing:
- Confirm you are logged in: `npm whoami`
- If not: `npm login`
- Confirm the package name is still available: `npm view vibeaudit` should return 404

---

## Definition of done

- [ ] `package.json` has all required fields, no `"private": true`
- [ ] `LICENSE` file exists (MIT)
- [ ] `.npmignore` excludes test fixtures, CLAUDE.md, dev config
- [ ] `npm pack --dry-run` shows a clean, minimal file list
- [ ] Local tarball install works: `vibeaudit` and `vibeaudit --path` both run correctly
- [ ] `npm test` still passes (all tests green)
- [ ] README.md exists with install, usage, exit codes, and dogfood note

Do not run `npm publish` — stop at the tarball install test. Publish is a manual
step.
