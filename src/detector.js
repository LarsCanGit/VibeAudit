'use strict';

const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['.git', 'node_modules', '.gradle', '__pycache__', '.venv', 'venv', 'env']);

function detectAt(dirPath) {
  const results = [];

  if ((fs.existsSync(path.join(dirPath, 'build.gradle')) ||
       fs.existsSync(path.join(dirPath, 'build.gradle.kts'))) &&
      (fs.existsSync(path.join(dirPath, 'gradlew')) ||
       fs.existsSync(path.join(dirPath, 'gradlew.bat')))) {
    results.push({ stack: 'android', path: dirPath });
  }

  if (fs.existsSync(path.join(dirPath, 'package.json'))) {
    results.push({ stack: 'node', path: dirPath });
  }

  const hasPythonSentinel =
    fs.existsSync(path.join(dirPath, 'pyproject.toml')) ||
    fs.existsSync(path.join(dirPath, 'setup.py')) ||
    fs.existsSync(path.join(dirPath, 'requirements.txt'));

  const entries = fs.existsSync(dirPath) ? fs.readdirSync(dirPath) : [];
  // Detect Python via .py files only when no other stack is present — avoids spurious
  // Python runner activation on Node/Android projects with stray scripts
  const hasPyFiles = entries.some(f => {
    if (!f.endsWith('.py')) return false;
    try { return fs.statSync(path.join(dirPath, f)).isFile(); } catch (_) { return false; }
  });
  if (hasPythonSentinel || (hasPyFiles && results.length === 0)) {
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
