'use strict';

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['.git', 'node_modules', '.gradle', '__pycache__', '.venv', 'venv']);

function detectAt(dirPath) {
  const results = [];

  if (fs.existsSync(path.join(dirPath, 'build.gradle')) ||
      fs.existsSync(path.join(dirPath, 'build.gradle.kts'))) {
    results.push({ stack: 'android', path: dirPath });
  }

  if (fs.existsSync(path.join(dirPath, 'package.json'))) {
    results.push({ stack: 'node', path: dirPath });
  }

  const entries = fs.existsSync(dirPath) ? fs.readdirSync(dirPath) : [];
  if (
    fs.existsSync(path.join(dirPath, 'pyproject.toml')) ||
    fs.existsSync(path.join(dirPath, 'setup.py')) ||
    fs.existsSync(path.join(dirPath, 'requirements.txt')) ||
    entries.some(f => f.endsWith('.py'))
  ) {
    results.push({ stack: 'python', path: dirPath });
  }

  return results;
}

function detect(targetPath) {
  const detected = detectAt(targetPath);

  const entries = fs.existsSync(targetPath) ? fs.readdirSync(targetPath) : [];
  for (const entry of entries) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
    const full = path.join(targetPath, entry);
    try {
      if (fs.statSync(full).isDirectory()) {
        detected.push(...detectAt(full));
      }
    } catch (_) {
      // skip unreadable entries
    }
  }

  if (detected.length === 0) {
    return [{ stack: 'unknown', path: targetPath }];
  }

  return detected;
}

module.exports = { detect };
