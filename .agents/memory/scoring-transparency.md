---
name: Scoring transparency
description: Keeps LyricLab final scores explainable from the visible score dimensions.
---

Final scores must equal the displayed dimension total multiplied by the displayed multiplier. Do not add hidden bonuses or include score dimensions that are not rendered on the result screen.

**Why:** A submission previously displayed a final score that could not be derived from its visible dimensions, which undermines player trust in scoring.

**How to apply:** When changing score formulas or adding a contributing dimension, either display that dimension in the result breakdown or exclude it from the final-score total. A missing deterministic dimension should render as unavailable rather than receive a default score.