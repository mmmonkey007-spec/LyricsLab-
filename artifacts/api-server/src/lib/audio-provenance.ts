export const AUDIO_PROVENANCE_VALUES = [
  "original",
  "generated",
  "other",
  "splice",
  "unknown",
  "composite",
] as const;

export type AudioProvenance = (typeof AUDIO_PROVENANCE_VALUES)[number];
export type BeatSourceProvenance = Exclude<AudioProvenance, "composite">;

export type AudioBeatManifest = {
  version: 1;
  outputId: string;
  sources: Array<{
    id: string;
    provenance: BeatSourceProvenance;
  }>;
};

export class AudioProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioProvenanceError";
  }
}

export function assertBeatManifestAllowed(
  manifest: unknown,
): asserts manifest is AudioBeatManifest {
  if (!manifest || typeof manifest !== "object") {
    throw new AudioProvenanceError("A valid beat manifest is required for composite audio.");
  }
  const candidate = manifest as Partial<AudioBeatManifest>;
  if (
    candidate.version !== 1 ||
    typeof candidate.outputId !== "string" ||
    candidate.outputId.trim().length === 0 ||
    !Array.isArray(candidate.sources) ||
    candidate.sources.length === 0
  ) {
    throw new AudioProvenanceError("A valid beat manifest is required for composite audio.");
  }

  const ids = new Set<string>();
  for (const untrustedSource of candidate.sources as unknown[]) {
    if (!untrustedSource || typeof untrustedSource !== "object") {
      throw new AudioProvenanceError("Beat manifest sources must be verified audio assets.");
    }
    const source = untrustedSource as { id?: unknown; provenance?: unknown };
    if (
      typeof source.id !== "string" ||
      source.id.trim().length === 0 ||
      ids.has(source.id) ||
      source.id === candidate.outputId
    ) {
      throw new AudioProvenanceError("Beat manifest source IDs must be unique and distinct from the output.");
    }
    if (
      source.provenance === "unknown" ||
      !["original", "generated", "other", "splice"].includes(source.provenance as string)
    ) {
      throw new AudioProvenanceError("Unknown sources cannot be verified for an AI upload.");
    }
    ids.add(source.id);
  }

  if (ids.has(candidate.outputId)) {
    throw new AudioProvenanceError("A composite output cannot be the same asset as one of its sources.");
  }

  const sources = candidate.sources as AudioBeatManifest["sources"];
  const hasSpliceSource = sources.some((source) => source.provenance === "splice");
  if (hasSpliceSource && sources.length < 2) {
    throw new AudioProvenanceError("A Splice sound cannot be uploaded alone; combine it with other sounds first.");
  }
}

/**
 * The only gate for sending audio bytes to a remote AI model.
 *
 * Provenance must be assigned by trusted server-side code. A composite is
 * accepted only when its source manifest proves it is a distinct, multi-source
 * work when Splice material is present.
 */
export function assertAudioMayBeSentToAi(
  provenance: AudioProvenance,
  manifest?: unknown,
): void {
  if (!AUDIO_PROVENANCE_VALUES.includes(provenance)) {
    throw new AudioProvenanceError("Unsupported audio provenance cannot be sent to an AI model.");
  }
  if (provenance === "splice") {
    throw new AudioProvenanceError("Splice audio cannot be sent to an AI model as an individual source.");
  }
  if (provenance === "unknown") {
    throw new AudioProvenanceError("Audio with unknown provenance cannot be sent to an AI model.");
  }
  if (provenance === "composite") {
    assertBeatManifestAllowed(manifest);
  }
}