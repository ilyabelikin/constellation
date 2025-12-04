#!/usr/bin/env node

/**
 * Version Update Script
 * Updates version across all package.json files and shared constants
 * 
 * Usage: node update-version.js <version> [version-name]
 * Example: node update-version.js 0.4.0 "Technology Tree"
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node update-version.js <version> [version-name]');
  console.error('Example: node update-version.js 0.4.0 "Technology Tree"');
  process.exit(1);
}

const newVersion = args[0];
const versionName = args[1] || '';

// Validate version format (semantic versioning)
if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
  console.error('Error: Version must be in format X.Y.Z (e.g., 0.3.0)');
  process.exit(1);
}

console.log(`Updating version to ${newVersion}${versionName ? ` - ${versionName}` : ''}...`);

// Files to update
const packageFiles = [
  'package.json',
  'client/package.json',
  'server/package.json',
  'shared/package.json'
];

const constantsFile = 'shared/src/constants.ts';

// Update package.json files
for (const file of packageFiles) {
  const filePath = path.join(__dirname, file);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const pkg = JSON.parse(content);
    pkg.version = newVersion;
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`✓ Updated ${file}`);
  } catch (error) {
    console.error(`✗ Failed to update ${file}:`, error.message);
  }
}

// Update constants.ts
try {
  const filePath = path.join(__dirname, constantsFile);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Update GAME_VERSION
  content = content.replace(
    /export const GAME_VERSION = ["'].*?["'];/,
    `export const GAME_VERSION = "${newVersion}";`
  );
  
  // Update VERSION_NAME if provided
  if (versionName) {
    content = content.replace(
      /export const VERSION_NAME = ["'].*?["'];/,
      `export const VERSION_NAME = "${versionName}";`
    );
  }
  
  fs.writeFileSync(filePath, content);
  console.log(`✓ Updated ${constantsFile}`);
} catch (error) {
  console.error(`✗ Failed to update ${constantsFile}:`, error.message);
}

console.log('\n✅ Version update complete!');
console.log(`\nNext steps:`);
console.log(`1. Update CHANGELOG.md with release notes for version ${newVersion}`);
console.log(`2. Commit changes: git add -A && git commit -m "Bump version to ${newVersion}"`);
console.log(`3. Tag release: git tag v${newVersion}`);
console.log(`4. Build and deploy: npm run build`);

