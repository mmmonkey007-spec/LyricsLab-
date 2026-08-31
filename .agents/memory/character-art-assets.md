---
name: Character art assets
description: Defines how locked character artwork must be retained and rendered in LyricLab.
---

Use the provided, locked character artwork as locally saved project assets for every character appearance. Never render temporary placeholder characters when real art is supplied, and never link to an expiring signed asset URL at runtime.

**Why:** Signed Scenario CDN URLs expire, while local assets keep the character presentation stable across development, preview, and release builds.

**How to apply:** Download and validate supplied character images into the mobile asset library, then import those files into the relevant React Native screen or component. Preserve the original artwork unless a replacement is explicitly provided.