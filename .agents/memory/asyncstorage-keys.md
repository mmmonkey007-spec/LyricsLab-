---
name: AsyncStorage key preservation
description: When renaming WC/OG TypeScript identifiers, the AsyncStorage key strings must stay unchanged.
---

When the "Weakness Coach" feature was renamed to "OG" internally, only TypeScript identifiers were renamed. The following strings must remain unchanged to preserve persisted user data:

- AsyncStorage keys: `"lyriclab_wc_ever_unlocked"`, `"wc_home_used"`
- URL params: `isWeaknessCoach` (used in expo-router navigation params)

**Why:** These are serialised into AsyncStorage and navigation URLs at runtime. Changing the strings would silently drop existing users' unlock state and break deep links.

**How to apply:** Any future rename of this feature must audit AsyncStorage.getItem/setItem call strings and router.push params separately from TS variable names.
