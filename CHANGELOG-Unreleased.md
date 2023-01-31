# Changelog

## Unreleased

### Highlights

- [iOS] Older version of iOS Installation docs said to import WatermelonDB's `SupportingFiles/Bridging.h` from your app project's `Bridging.h`.
  This is no longer recommended, and you should remove this import from your project. If this removal causes build issues, please file an issue.

### BREAKING CHANGES

- [iOS] In your Podfile, make the following change:

    ```rb
    # replace this:
    pod 'simdjson', path: '../node_modules/@nozbe/simdjson'
    # with this:
    pod 'simdjson', path: '../node_modules/@nozbe/simdjson', modular_headers: true
    ```

### Deprecations

### New features

- [Android] Added `experimentalUnsafeNativeReuse` option to SQLiteAdapter. See `src/adapters/sqlite/type.js` for more details

### Fixes

- [Sync] Improve memory consumption (less likely to get "Maximum callstack exceeded" error)
- [JSI] Improved reliability when reloading RCTBridge
- [iOS] Fix "range of supported deployment targets" Xcode warning
- [JSI] Improved reliability when reloading RCTBridge
- [TypeScript] Fix type of `DirtyRaw` to `object` (from `Object`)

### Performance

### Changes

- Simplified CocoaPods/iOS integration
- Updated `@babel/runtime` to 7.20.13
- Updated `rxjs` to 7.8.0
- Updated `sqlite` (SQLite used on Android in JSI mode) to 3.40.1
- Updated `simdjson` to 3.1.0
- Updated Installation docs
- [flow] Updated Flow version used in the project to 198.1. This shouldn't have an impact on you, but could fix or break Flow if you don't have WatermelonDB set to `[declarations]` mode
- [flow] Clarified docs to recommend the use of `[declarations]` mode for WatermelonDB

### Internal
