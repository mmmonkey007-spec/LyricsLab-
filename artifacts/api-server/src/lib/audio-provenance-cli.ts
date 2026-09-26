import { readFileSync } from "node:fs";
import {
  assertAudioMayBeSentToAi,
  type AudioProvenance,
} from "./audio-provenance";

type GuardRequest = {
  provenance: AudioProvenance;
  manifest?: unknown;
};

try {
  const request = JSON.parse(readFileSync(0, "utf8")) as GuardRequest;
  assertAudioMayBeSentToAi(request.provenance, request.manifest);
  process.stdout.write("Audio provenance accepted.\n");
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}