#!/usr/bin/env node
/**
 * Auto-increment version in version.json after each build.
 *
 * Usage:
 *   node scripts/bump-version.js          # bump patch  (1.0.0 → 1.0.1)
 *   node scripts/bump-version.js minor    # bump minor  (1.0.1 → 1.1.0)
 *   node scripts/bump-version.js major    # bump major  (1.1.0 → 2.0.0)
 */
const fs = require('fs');
const path = require('path');

const versionFile = path.join(__dirname, '..', 'version.json');
const version = JSON.parse(fs.readFileSync(versionFile, 'utf8'));

const bump = process.argv[2] || 'patch';

if (bump === 'major') {
  version.major++;
  version.minor = 0;
  version.patch = 0;
} else if (bump === 'minor') {
  version.minor++;
  version.patch = 0;
} else {
  version.patch++;
}

// versionCode must be a monotonically increasing integer for Play Store
version.versionCode++;

fs.writeFileSync(versionFile, JSON.stringify(version, null, 2) + '\n');

const name = `${version.major}.${version.minor}.${version.patch}`;
console.log(`Version bumped to ${name} (versionCode ${version.versionCode})`);
