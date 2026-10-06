'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { detect } = require('../src/detector');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vibeaudit-detector-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('detector — android', () => {
  test('detects android when build.gradle.kts AND gradlew.bat present', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'build.gradle.kts'), '');
      fs.writeFileSync(path.join(dir, 'gradlew.bat'), '');
      const result = detect(dir);
      expect(result.some(r => r.stack === 'android' && r.path === dir)).toBe(true);
    } finally { cleanup(dir); }
  });

  test('does NOT detect android when build.gradle present but no gradlew', () => {
    const dir = makeTmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'build.gradle'), '');
      const result = detect(dir);
      expect(result.some(r => r.stack === 'android')).toBe(false);
    } finally { cleanup(dir); }
  });

  test('does NOT emit android for app/ subdir when only root has gradlew', () => {
    // Simulates a standard Android project: root has gradlew + build.gradle.kts,
    // app/ subdir has build.gradle but no gradlew — should produce exactly one android entry.
    const root = makeTmpDir();
    try {
      fs.writeFileSync(path.join(root, 'build.gradle.kts'), '');
      fs.writeFileSync(path.join(root, 'gradlew.bat'), '');
      const appDir = path.join(root, 'app');
      fs.mkdirSync(appDir);
      fs.writeFileSync(path.join(appDir, 'build.gradle'), '');
      const result = detect(root);
      const androidEntries = result.filter(r => r.stack === 'android');
      expect(androidEntries).toHaveLength(1);
      expect(androidEntries[0].path).toBe(root);
    } finally { cleanup(root); }
  });
});
