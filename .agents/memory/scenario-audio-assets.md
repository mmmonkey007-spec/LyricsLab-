---
name: Scenario audio asset retention
description: Scenario-generated audio assets may no longer be retrievable by ID when a later run begins.
---

Download Scenario audio assets immediately after generation or handoff, and preserve the local copy before any downstream stem extraction or mixing.

**Why:** A previously recorded generated vocal/bed asset returned HTTP 404 from the asset metadata endpoint during a later mix run, while the original source asset remained available.

**How to apply:** Treat a missing Scenario asset as a blocking input failure; do not silently replace it with a different mix or source.