---
name: DimensionScores shape
description: DimensionScores now includes humorCraft; all literal score objects must include it.
---

`DimensionScores` in `GameContext.tsx` requires `humorCraft: number`. All places that construct a score object literal must include it.

**Why:** TypeScript strict mode makes the field required. Battle API response doesn't return a humor score yet, so battle code defaults to `humorCraft: 0`.

**How to apply:** When adding more dimension fields to the API response, update GameContext.tsx and then grep for all `DimensionScores`-shaped literals to keep them in sync.
