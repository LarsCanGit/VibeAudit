'use strict';

const fs = require('fs');
const path = require('path');

function detect(targetPath) {
  const stacks = [];

  if (fs.existsSync(path.join(targetPath, 'build.gradle')) ||
      fs.existsSync(path.join(targetPath, 'build.gradle.kts'))) {
    stacks.push('android');
  }

  if (fs.existsSync(path.join(targetPath, 'package.json'))) {
    stacks.push('node');
  }

  if (stacks.length === 0) {
    return ['unknown'];
  }

  return stacks;
}

module.exports = { detect };
