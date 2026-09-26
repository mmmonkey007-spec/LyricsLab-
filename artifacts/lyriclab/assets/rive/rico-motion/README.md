# RICO motion pilot

This Rive scene embeds the existing `assets/characters/snap-idle.png` art
directly from the workspace. It defines separate looping state machines for
`RICO Idle` and `RICO Rapping`.

The source image is flattened. Both loops move and slightly stretch the whole
image; they do not animate RICO's mouth or limbs.

Rebuild the bundled runtime file from the workspace root with:

```sh
~/.rive/bin/rive artifacts/lyriclab/assets/rive/rico-motion --once
```

After installing the local Rive CLI at `~/.rive/bin/rive`, this build is
unsigned and does not require a Rive account. The generated `.riv` file in
`build/` is bundled by Metro; build logs and `.rev` exports are not tracked.