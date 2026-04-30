# VibeAudit — Claude Code Skill

## What This Is

A Claude Code skill that teaches Claude Code how to invoke VibeAudit, interpret its output, and self-correct until the project is clean. Triggered by natural language — no need to remember the exact CLI syntax.

## Skill Location on Disk

```
C:\Users\lars\.claude\skills\vibeaudit\SKILL.md
```

## Trigger Phrases

Claude Code will invoke this skill when it hears any of:

- "run vibeaudit"
- "check for errors"
- "check for errors and fix them"
- "run a QA check"
- "make sure the code is clean before pushing"
- Any request to validate generated code quality or confirm a project is ready to commit or push

## SKILL.md Source

Keep this in sync with the file on disk. If VibeAudit's output contract changes (new fields, exit code behavior, blocking logic), update both.

```markdown
---
name: vibeaudit
description: >
  Run VibeAudit — a CLI QA tool that catches issues in AI-generated code before pushing to a remote.
  ALWAYS use this skill when Lars says "run vibeaudit", "check for errors", "check for errors and fix them",
  "run a QA check", or "make sure the code is clean before pushing". Also trigger when Lars asks to
  validate generated code quality or wants to confirm a project is ready to commit or push.
  This skill installs vibeaudit if needed, runs it, parses the output JSON, fixes all blocking failures,
  and loops until the project is clean.
---

## VibeAudit Workflow

### 1. Ensure vibeaudit is installed
Check if vibeaudit is available:
```bash
vibeaudit --version
```
If the command is not found, install it:
```bash
npm install -g @lmhansen/vibeaudit
```

### 2. Determine the project root
Use the current working directory as `<project-root>` unless the user specifies otherwise.

### 3. Run vibeaudit
```bash
vibeaudit --path <project-root>
```
Capture both stdout and the exit code.

### 4. Parse the output
Find the first `{` in stdout — everything from there is the JSON result. Parse it.

### 5. Interpret results
- **`blocking: true` + `status: "fail"`** → This is a real failure. Fix it before continuing.
- **`status: "skipped"`** → Not a failure. Ignore it.
- **Exit code 0** → All blocking checks passed. Done.
- **Exit code 1** → One or more blocking failures are present.

### 6. Fix blocking failures
For each `blocking: true` / `status: "fail"` item, read the check description and fix the
underlying issue in the code. Do not skip or suppress — fix the root cause.

### 7. Loop
Re-run vibeaudit after fixing. Repeat the fix → re-run cycle until:
- Exit code is 0, AND
- No items have `blocking: true` + `status: "fail"`

Then confirm: "VibeAudit passed — all blocking checks are clean."
```

## Maintenance Notes

- If the output contract changes (new JSON fields, exit code semantics, blocking logic), update the skill and this doc together.
- The fix → re-run loop handles cascading failures naturally — a second-pass failure after fixing the first is expected behavior, not an error condition.
- `skipped` is not a failure. Skipped checks mean the check wasn't configured for this project, not that something is wrong.
