# Version Management System

## Overview

Constellation uses a centralized version management system that keeps versions synchronized across all packages and displays them in the game UI.

## Version Format

We follow **Semantic Versioning** (semver): `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes or major feature releases
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes and minor improvements

Example: `0.3.0 - Species and Colonies`

## Single Source of Truth

Version information is defined in **two places**:

1. **`shared/src/constants.ts`** - Runtime version constants
   ```typescript
   export const GAME_VERSION = "0.3.0";
   export const VERSION_NAME = "Species and Colonies";
   ```

2. **All `package.json` files** - npm package versions
   - `package.json`
   - `client/package.json`
   - `server/package.json`
   - `shared/package.json`

## Updating the Version

### Automated Method (Recommended)

Use the provided update script:

```bash
npm run version:update 0.4.0 "Technology Tree"
```

This will:
- ✅ Update all 4 `package.json` files
- ✅ Update `shared/src/constants.ts`
- ✅ Provide next steps (update changelog, commit, tag)

### Manual Method

If you need to update manually:

1. Update `GAME_VERSION` and `VERSION_NAME` in `shared/src/constants.ts`
2. Update `version` field in all 4 `package.json` files
3. Rebuild shared package: `cd shared && npm run build`
4. Update `CHANGELOG.md` with release notes
5. Rebuild all packages: `npm run build`

## Version Display

The version is automatically displayed in:

- **Lobby Screen**: Shows below the "Constellation" title
  - Format: `v0.3.0 - Species and Colonies`
  
- **Changelog**: The version header in the "What's New" section
  - Format: `Version 0.3.0 - Species and Colonies`

## Release Workflow

When releasing a new version:

1. **Update version**:
   ```bash
   npm run version:update 0.4.0 "New Feature Name"
   ```

2. **Update CHANGELOG.md**:
   - Add release notes for the new version
   - Document new features, changes, and fixes
   - Move completed "Coming Soon" items to features

3. **Build all packages**:
   ```bash
   npm run build
   ```

4. **Test the build**:
   - Verify lobby shows correct version
   - Test Continue and New Game flows
   - Check changelog displays correctly

5. **Commit and tag**:
   ```bash
   git add -A
   git commit -m "Release v0.4.0 - New Feature Name"
   git tag v0.4.0
   git push origin main --tags
   ```

6. **Deploy** (if applicable):
   ```bash
   ./deploy.sh
   ```

## Best Practices

- 📝 **Always update CHANGELOG.md** when bumping version
- 🏷️ **Tag releases** in git for easy rollback
- 🧪 **Test thoroughly** before releasing
- 📢 **Communicate** what's new to players via changelog
- 🔄 **Keep "Coming Soon"** section updated with roadmap

## Version History

- **0.3.0** - Species and Colonies (Current)
  - Species generation system
  - Colony founding and management
  - Diplomatic stances
  - Improved lobby with changelog

- **0.2.0** - (Previous features)
- **0.1.0** - Initial release


