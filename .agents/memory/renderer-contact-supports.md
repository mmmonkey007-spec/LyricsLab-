---
name: Renderer contact supports
description: How build-time character renders handle walls, seats, and other pose-authoring supports.
---

Contact supports are allowed to participate in pose authoring and clearance checks, but they must be hidden before the main transparent sprite render. The pose contract should report whether a support is actually visible from the render camera rather than failing merely because a support object exists. Rendering and artifact retention must continue even when a semantic pose check fails.

**Why:** Leaning poses need real geometry to place the body reliably, while support pixels would bake into sprites and make the asset unusable.

**How to apply:** Add supports before posing/framing, validate their camera visibility separately, hide them before every final render (including crops), and keep the resulting images and measured failure details in the summary.