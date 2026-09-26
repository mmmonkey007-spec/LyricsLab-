# RICO multipart Rive scene

The scene embeds the aligned user-provided head, jaw, arms, torso, and legs.
`process_parts.py` restores the transparent shirt opening from the aligned
flattened source image, then crops the layers for embedding. The lower face is
split into a hinged jaw with a small locally drawn mouth cavity.

Rebuild the image layers and unsigned Rive runtime file from the workspace root:

```sh
python artifacts/lyriclab/assets/rive/rico-parts/process_parts.py
~/.rive/bin/rive artifacts/lyriclab/assets/rive/rico-parts --once
```

The Rive file contains separate `RICO Idle` and `RICO Rapping` state machines.