---
name: Cartwheel rig inventory
description: How to compare the alternate Cartwheel skeleton with the court character rig without treating export spelling as topology.
---

The Cartwheel source uses a different naming scheme and includes finger joint chains, while the court rig uses helper twist joints. Compare retargetable semantic slots, not literal strings: the eleven additions are spine3 plus ten finger families; retain the full raw joint lists in the run summary.

**Why:** A literal name-set subtraction falsely reports every shared body joint as unique and obscures the meaningful difference between the rigs.

**How to apply:** Download and parse the Cartwheel GLB's skin-joint names only for inventory. Do not import it into Blender, pose it, render it, or upload it.