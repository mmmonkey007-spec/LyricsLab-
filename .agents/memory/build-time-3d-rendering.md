---
name: Build-time 3D rendering
description: Records the boundary between character-model tooling and the LyricLab mobile runtime.
---

Render character models to flat image assets with workspace development tooling before they enter LyricLab. Never add mesh loading, 3D rendering libraries, or runtime 3D calculations to the mobile app.

**Why:** The product direction explicitly keeps the phone on the existing 2D image pipeline; 3D exists only as an offline source for generating character PNGs.

**How to apply:** Put model download and rendering utilities outside the mobile artifact, cache source models locally, and ship only the resulting flat images to LyricLab.

When framing imported rigged GLBs, exclude meshes in collections marked hidden for rendering before calculating model bounds.

**Why:** Scenario animation exports may include large helper geometry in a hidden `glTF_not_exported` collection; including it makes the visible character render far too small.

**How to apply:** Compute camera bounds from evaluated, camera-renderable character meshes so sampled poses share stable framing without helper objects affecting the envelope.

Headless character jobs must render with CPU Cycles rather than Eevee.

**Why:** Eevee requires a graphics context and crashes in the headless Replit Blender environment with GLX context errors; CPU Cycles completes reliably without a display.

**How to apply:** Keep offline character-render jobs on Cycles with the CPU device, and tune samples for the required art quality instead of switching to Eevee for speed.

Court character sprites should use free-standing poses with no wall, rail, or bench geometry; create apparent surface contact later through sprite placement over the court background.

**Why:** Exact surface-contact poses repeatedly produced clipping, floating limbs, and unstable body tilts that made the transparent sprites difficult to composite.

**How to apply:** Render only the character, a soft contact shadow, and an explicitly carried prop such as RICO's basketball. Use mid-air seated attitudes where needed and preserve compositing anchors in the manifest.

Inspection companions should contain raw base64 for an adaptive JPEG, split into ordered text parts when necessary, without a data-URI header.

**Why:** JPEG provides materially higher inspection resolution within the text-read ceiling; numbered parts and a hash-bearing index preserve exact reassembly when one file is insufficient.

**How to apply:** Start previews near a 1000-pixel longest side, step down only when needed, keep every part below 90,000 characters, and never alter the source PNG.

Re-author paid-upload character poses with local low-resolution visual sweeps plus the production geometry contracts before changing the checked-in pose or running the upload job.

**Why:** Bone-point coordinates and depth metrics can pass while wrist orientation still exposes an open or splayed palm; visual comparison is required, but repeating full-resolution uploads wastes time and asset IDs.

**How to apply:** Sweep only the permitted bones against cached GLBs, shortlist candidates by measurable contracts, visually inspect low-resolution finalists, then run the full render/upload pipeline once for the selected pose.

Imported left/right arm chains may have different bone rolls, so mirrored IK targets and poles do not guarantee mirrored elbow motion.

**Why:** Applying the same pole angle to both sides of a folded-arm pose sent one elbow upward or into the torso even though the target positions were symmetric. Targeting the hand head with a two-bone, position-only IK chain preserved the wrist seam while independently calibrated pole angles placed both elbows correctly.

**How to apply:** Calibrate each arm's pole angle independently on the imported rig. For folded arms, solve upper arm and forearm from a hand-head target, verify wrist seam continuity, and measure distal forearm clearance from the upper-arm volume before rendering paid uploads.

Flag implausible limb Euler components without clamping them. Refuse the entire affected bone rotation, but still render the character before reporting the refusal.

**Why:** Extreme parent-bone rotations can leave a rendered hand detached or shred clothing while unrelated semantic pose checks still pass. The ±90° bound with full-bone refusal was confirmed to preserve BUZZ's attached, clean hand. The picture remains the primary diagnostic, so aborting or suppressing it destroys the most useful evidence.

**How to apply:** Render and upload each character's main image and crop first. Then report the bone, axis, and requested degrees as FAIL beside those images; all geometry and character-specific checks are report-only and never suppress a render.