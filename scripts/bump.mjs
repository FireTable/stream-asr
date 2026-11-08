#!/usr/bin/env node
/**
 * scripts/bump.mjs
 * Monorepo semantic version bump utility for @firetable/stream-asr.
 *
 * Usage:
 *   node scripts/bump.mjs patch        # 0.1.0 -> 0.1.1
 *   node scripts/bump.mjs minor        # 0.1.0 -> 0.2.0
 *   node scripts/bump.mjs major        # 0.1.0 -> 1.0.0
 *   node scripts/bump.mjs 0.2.5        # Set explicit version
 *   node scripts/bump.mjs patch --tag  # Bump + commit + git tag vX.Y.Z
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const TARGET_PACKAGES = [
  path.join(ROOT_DIR, 'packages', 'sdk', 'package.json'),
  path.join(ROOT_DIR, 'package.json'),
  path.join(ROOT_DIR, 'apps', 'showcase', 'package.json'),
];

function parseSemver(v) {
  const match = v.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) {
    throw new Error(`Invalid semver version: "${v}"`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
  };
}

function computeNextVersion(currentVersion, bumpType) {
  const parsed = parseSemver(currentVersion);

  if (bumpType === 'major') {
    return `${parsed.major + 1}.0.0`;
  }
  if (bumpType === 'minor') {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  if (bumpType === 'patch') {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }

  // Explicit version string
  parseSemver(bumpType);
  return bumpType.replace(/^v/, '');
}

function main() {
  const args = process.argv.slice(2);
  const bumpType = args.find(a => !a.startsWith('--')) || 'patch';
  const shouldTag = args.includes('--tag') || args.includes('-t');

  // Read current version from SDK package.json (Single Source of Truth)
  const sdkPkgPath = TARGET_PACKAGES[0];
  const sdkPkg = JSON.parse(fs.readFileSync(sdkPkgPath, 'utf8'));
  const currentVersion = sdkPkg.version;

  const nextVersion = computeNextVersion(currentVersion, bumpType);

  console.log(`\n📦 Bumping version: \x1b[33mv${currentVersion}\x1b[0m ➜ \x1b[32mv${nextVersion}\x1b[0m\n`);

  for (const pkgPath of TARGET_PACKAGES) {
    if (fs.existsSync(pkgPath)) {
      const content = fs.readFileSync(pkgPath, 'utf8');
      const json = JSON.parse(content);
      json.version = nextVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
      const rel = path.relative(ROOT_DIR, pkgPath);
      console.log(`  ✓ Updated ${rel}`);
    }
  }

  if (shouldTag) {
    console.log(`\n🔖 Creating git commit and tag: v${nextVersion}...`);
    try {
      execSync('git add package.json packages/sdk/package.json apps/showcase/package.json', { stdio: 'inherit', cwd: ROOT_DIR });
      execSync(`git commit -m "chore(release): bump version to v${nextVersion}"`, { stdio: 'inherit', cwd: ROOT_DIR });
      execSync(`git tag -a v${nextVersion} -m "Release v${nextVersion}"`, { stdio: 'inherit', cwd: ROOT_DIR });
      console.log(`  ✓ Created commit & tag: \x1b[36mv${nextVersion}\x1b[0m`);
      console.log(`\n🚀 Run \x1b[32mgit push --follow-tags\x1b[0m to trigger GitHub Actions NPM Publish!`);
    } catch (err) {
      console.error(`\x1b[31mFailed to create git commit/tag: ${err.message}\x1b[0m`);
    }
  } else {
    console.log(`\n💡 Tip: Run with \x1b[36m--tag\x1b[0m to automatically create git commit & release tag:`);
    console.log(`   \x1b[32mpnpm bump:${bumpType} --tag\x1b[0m\n`);
  }
}

main();
