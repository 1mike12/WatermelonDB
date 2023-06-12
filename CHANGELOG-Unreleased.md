### Highlights

**Removed legacy Swift and Kotlin React Native Modules**

Following the addition of new Native Modules in 0.26, we're removing the old implementations. We expect this to simplify installation process and remove a ton of compatibility and configuration issues due to Kotlin version mismatchs and the CocoaPods-Swift issues when using `use_frameworks!` or Expo.

**New `@nozbe/watermelondb/react` folder**

All React/React Native helpers for WatermelonDB are now available as imports from `@nozbe/watermelodb/react`. Imports from previous `@nozbe/watermelondb/DatabaseProvider` and `@nozbe/watermelondb/hooks` folders are deprecated and will be removed in a future version.

### BREAKING CHANGES

Changes unlikely to cause issues:

- [iOS] If `import WatermelonDB` is used in your Swift app (for Turbo sync), remove it and replace with `#import <WatermelonDB/WatermelonDB.h>` in the bridging header
- [iOS] If you use `_watermelonDBLoggingHook`, remove it. No replacement is provided at this time, feel free to contribute if you need this
- [iOS] If you use `-DENABLE_JSLOCK_PERFORMANCE_HACK`, remove it. JSLockPerfHack has been non-functional for some time already, and has now been removed. Please file an issue if you relied on it.

### Deprecations

- Imports from `@nozbe/watermelondb/DatabaseProvider` and `@nozbe/watermelondb/hooks`. Change to `@nozbe/watermelondb/react`

### New features

### Fixes

- [Flow/TS] Improved typing of DatabaseContext

### Performance

### Changes

### Internal
