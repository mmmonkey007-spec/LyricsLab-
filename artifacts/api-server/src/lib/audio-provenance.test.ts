import assert from "node:assert/strict";
import {
  assertAudioMayBeSentToAi,
  assertBeatManifestAllowed,
  type AudioBeatManifest,
} from "./audio-provenance";

const oneSpliceSource: AudioBeatManifest = {
  version: 1,
  outputId: "single-loop-output",
  sources: [{ id: "splice-loop-01", provenance: "splice" }],
};

const combinedSpliceWork: AudioBeatManifest = {
  version: 1,
  outputId: "finished-beat",
  sources: [
    { id: "splice-loop-01", provenance: "splice" },
    { id: "original-drum-hit", provenance: "original" },
  ],
};

assert.doesNotThrow(() => assertAudioMayBeSentToAi("generated"));
assert.doesNotThrow(() => assertAudioMayBeSentToAi("original"));
assert.doesNotThrow(() => assertAudioMayBeSentToAi("other"));
assert.throws(() => assertAudioMayBeSentToAi("splice"), /Splice audio cannot be sent/);
assert.throws(() => assertAudioMayBeSentToAi("unknown"), /unknown provenance/);
assert.throws(() => assertAudioMayBeSentToAi("composite"), /valid beat manifest is required/);
assert.throws(() => assertBeatManifestAllowed(oneSpliceSource), /cannot be uploaded alone/);
assert.throws(() => assertAudioMayBeSentToAi("composite", oneSpliceSource), /cannot be uploaded alone/);
assert.doesNotThrow(() => assertAudioMayBeSentToAi("composite", combinedSpliceWork));
assert.throws(
  () =>
    assertAudioMayBeSentToAi("composite", {
      version: 1,
      outputId: "unverified-mix",
      sources: [{ id: "unknown-source", provenance: "unknown" }],
    }),
  /Unknown sources cannot be verified/,
);

console.log("audio provenance guard: PASS");