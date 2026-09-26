import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assessPerformanceQuality,
  normalizePerformanceWord,
  PERFORMANCE_SAMPLE_RATE,
  type PerformanceQualityAssessment,
  type PerformanceQualityCheck,
  type TranscribedWord,
} from "./perform-my-verse-quality";
import {
  assertAudioMayBeSentToAi,
  assertBeatManifestAllowed,
  type AudioBeatManifest,
  type AudioProvenance,
} from "./audio-provenance";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";
const MUSIC_MODEL = "music_v2";
// The current Speech-to-Text API exposes this model as scribe_v1.
const TRANSCRIPTION_MODEL = "scribe_v1";
// ElevenLabs accepts seeds from 0 through 2147483647 for Music generation.
// This is a consistency seed, not a guarantee of byte-identical output.
export const MUSIC_GENERATION_SEED = 42_424_242;

export type PerformanceOptions = {
  intro: boolean;
  echoOut: boolean;
};

export type ProviderTake = {
  audio: Buffer;
  audioProvenance: AudioProvenance;
  beatManifest: AudioBeatManifest;
  generationCostUsd: number | null;
  transcriptionCostUsd: number | null;
  transcript: string;
  wordTexts: string[];
  durationMs: number;
};

export type PerformanceTakeLog = {
  attempt: number;
  elapsedMs: number;
  generationElapsedMs: number | null;
  transcriptionElapsedMs: number | null;
  wordsMatched: number;
  wordsExpected: number;
  rejectedCheck: PerformanceQualityCheck | "music-generation" | "transcription" | "audio-analysis" | "deadline" | "cancelled" | null;
  failedChecks: PerformanceQualityCheck[];
  mismatches: PerformanceWordMismatch[];
  accepted: boolean;
  generationCostHeader: string | null;
  transcriptionCostHeader: string | null;
  generationCostUsd: number | null;
  transcriptionCostUsd: number | null;
  voiceSpanRatio: number;
  audibleWordRatio: number;
  maxSpeechGapSeconds: number;
  eatenWordCount: number;
  lowConfidenceWordCount: number;
  confidenceWordCount: number;
  providerError: {
    service: "music-generation" | "transcription";
    httpStatus: number | null;
    bodyPreview: string | null;
    transportError: string | null;
  } | null;
};

type ProviderService = "music-generation" | "transcription";

type GeneratedAudio = {
  audio: Buffer;
  providerHttpStatus: number;
  generationCostUsd: number | null;
  generationCostHeader: string | null;
  durationMs: number;
  provenance: "generated";
};

export type PerformanceWordMismatch = {
  kind: "substitution" | "missing" | "extra";
  expected: string | null;
  heard: string | null;
};

type TakeLogCallback = (entry: PerformanceTakeLog) => void;

function providerKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not configured.");
  return key;
}

type ProviderCost = {
  usd: number | null;
  header: string | null;
};

function providerCost(headers: Headers): ProviderCost {
  for (const name of ["x-cost-usd", "x-cost", "x-request-cost"]) {
    const raw = headers.get(name);
    if (!raw) continue;
    const value = Number(raw);
    return {
      usd: Number.isFinite(value) && value >= 0 ? value : null,
      header: `${name}: ${raw}`,
    };
  }
  return { usd: null, header: null };
}

class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly service: ProviderService,
    readonly httpStatus: number,
    readonly bodyPreview: string,
    readonly cost: ProviderCost,
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

async function providerError(response: Response, service: ProviderService): Promise<ProviderRequestError> {
  const bodyPreview = (await response.text().catch(() => "")).slice(0, 500);
  const label = service === "music-generation" ? "Music generation" : "Speech-to-text";
  return new ProviderRequestError(
    `${label} request failed (HTTP ${response.status}): ${bodyPreview || response.statusText}`,
    service,
    response.status,
    bodyPreview,
    providerCost(response.headers),
  );
}

function durationForVerse(wordCount: number, intro: boolean): number {
  const seconds = wordCount / 2.8 + (intro ? 4 : 2);
  return Math.min(120_000, Math.max(3_000, Math.ceil(seconds * 1_000)));
}

function normalizeWord(word: string): string {
  return normalizePerformanceWord(word);
}

export function normalizedWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean);
}

function originalWords(text: string): string[] {
  return text
    .split(/\s+/)
    .filter((word) => normalizeWord(word).length > 0);
}

function wordMismatches(expectedWords: string[], heardWords: string[]): PerformanceWordMismatch[] {
  const expected = expectedWords.map(normalizeWord);
  const heard = heardWords.map(normalizeWord);
  const rows = Array.from(
    { length: expected.length + 1 },
    () => new Uint16Array(heard.length + 1),
  );

  for (let expectedIndex = expected.length; expectedIndex >= 0; expectedIndex -= 1) {
    for (let heardIndex = heard.length; heardIndex >= 0; heardIndex -= 1) {
      if (expectedIndex === expected.length) {
        rows[expectedIndex][heardIndex] = heard.length - heardIndex;
      } else if (heardIndex === heard.length) {
        rows[expectedIndex][heardIndex] = expected.length - expectedIndex;
      } else if (expected[expectedIndex] === heard[heardIndex]) {
        rows[expectedIndex][heardIndex] = rows[expectedIndex + 1][heardIndex + 1];
      } else {
        rows[expectedIndex][heardIndex] =
          1 +
          Math.min(
            rows[expectedIndex + 1][heardIndex + 1],
            rows[expectedIndex + 1][heardIndex],
            rows[expectedIndex][heardIndex + 1],
          );
      }
    }
  }

  const mismatches: PerformanceWordMismatch[] = [];
  let expectedIndex = 0;
  let heardIndex = 0;
  while (expectedIndex < expected.length || heardIndex < heard.length) {
    if (
      expectedIndex < expected.length &&
      heardIndex < heard.length &&
      expected[expectedIndex] === heard[heardIndex]
    ) {
      expectedIndex += 1;
      heardIndex += 1;
      continue;
    }

    const currentCost = rows[expectedIndex][heardIndex];
    const substitutionCost =
      expectedIndex < expected.length && heardIndex < heard.length
        ? rows[expectedIndex + 1][heardIndex + 1] + 1
        : Number.POSITIVE_INFINITY;
    const missingCost =
      expectedIndex < expected.length
        ? rows[expectedIndex + 1][heardIndex] + 1
        : Number.POSITIVE_INFINITY;

    if (substitutionCost === currentCost) {
      mismatches.push({
        kind: "substitution",
        expected: expectedWords[expectedIndex],
        heard: heardWords[heardIndex],
      });
      expectedIndex += 1;
      heardIndex += 1;
    } else if (missingCost === currentCost) {
      mismatches.push({ kind: "missing", expected: expectedWords[expectedIndex], heard: null });
      expectedIndex += 1;
    } else {
      mismatches.push({ kind: "extra", expected: null, heard: heardWords[heardIndex] });
      heardIndex += 1;
    }
  }
  return mismatches;
}

export function compareWordFidelity(expected: string[], delivered: string[]): boolean {
  return expected.length === delivered.length && expected.every((word, index) => word === delivered[index]);
}

/**
 * ElevenLabs treats each composition chunk as a bar. Keep bars on separate
 * chunks and cap their text at the provider's 200-character limit.
 */
export function formatVerseBars(verse: string): string[] {
  const bars: string[] = [];
  for (const sourceLine of verse.replace(/\r\n?/g, "\n").split("\n")) {
    const words = sourceLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let current = "";
    for (const word of words) {
      if (!current) {
        if (word.length <= 200) {
          current = word;
        } else {
          for (let offset = 0; offset < word.length; offset += 200) {
            bars.push(word.slice(offset, offset + 200));
          }
        }
      } else if (current.length + 1 + word.length <= 200) {
        current += ` ${word}`;
      } else {
        bars.push(current);
        current = word.length <= 200 ? word : "";
        for (let offset = 0; offset < word.length && !current; offset += 200) {
          bars.push(word.slice(offset, offset + 200));
        }
      }
    }
    if (current) bars.push(current);
  }
  return bars;
}

function readTranscription(payload: unknown): { text: string; words: TranscribedWord[] } {
  if (!payload || typeof payload !== "object") throw new Error("Speech-to-text returned an invalid response.");
  const body = payload as { text?: unknown; words?: unknown };
  const words = Array.isArray(body.words)
    ? body.words
        .filter((word): word is Record<string, unknown> => Boolean(word) && typeof word === "object")
        .filter((word) => word.type === "word" && typeof word.text === "string")
        .map((word) => ({
          text: word.text as string,
          startSeconds: typeof word.start === "number" && Number.isFinite(word.start) ? word.start : null,
          endSeconds: typeof word.end === "number" && Number.isFinite(word.end) ? word.end : null,
          logProbability:
            typeof word.logprob === "number" &&
            (Number.isFinite(word.logprob) || word.logprob === Number.NEGATIVE_INFINITY) &&
            word.logprob <= 0
              ? word.logprob
              : null,
        }))
    : [];
  return {
    text: typeof body.text === "string" ? body.text : words.map((word) => word.text).join(" "),
    words,
  };
}

export async function decodeAudioForAnalysis(audio: Buffer, signal: AbortSignal): Promise<{
  samples: Int16Array;
  sampleRate: number;
}> {
  if (signal.aborted) throw new Error("Audio analysis was cancelled.");
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
  return new Promise((resolve, reject) => {
    const decoder = spawn(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        "-ac",
        "1",
        "-ar",
        String(PERFORMANCE_SAMPLE_RATE),
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    const output: Buffer[] = [];
    let errorOutput = "";
    let settled = false;

    const removeAbortListener = () => signal.removeEventListener("abort", handleAbort);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      removeAbortListener();
      reject(error);
    };
    const handleAbort = () => {
      decoder.kill("SIGTERM");
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    decoder.stdout.on("data", (chunk: Buffer) => output.push(Buffer.from(chunk)));
    decoder.stderr.on("data", (chunk: Buffer) => {
      errorOutput = `${errorOutput}${chunk.toString("utf8")}`.slice(-1_000);
    });
    decoder.on("error", fail);
    decoder.on("close", (code) => {
      if (settled) return;
      settled = true;
      removeAbortListener();
      if (signal.aborted) {
        reject(new Error("Audio analysis was cancelled."));
        return;
      }
      if (code !== 0) {
        reject(new Error(`FFmpeg audio analysis failed: ${errorOutput.trim() || `exit code ${code}`}`));
        return;
      }

      const pcm = Buffer.concat(output);
      const sampleCount = Math.floor(pcm.length / 2);
      const samples = new Int16Array(sampleCount);
      for (let index = 0; index < sampleCount; index += 1) {
        samples[index] = pcm.readInt16LE(index * 2);
      }
      resolve({ samples, sampleRate: PERFORMANCE_SAMPLE_RATE });
    });
    decoder.stdin.on("error", () => {
      // The close event reports FFmpeg's exit status and diagnostic output.
    });
    decoder.stdin.end(audio);
  });
}

async function generateAudio(
  verse: string,
  options: PerformanceOptions,
  signal: AbortSignal,
): Promise<GeneratedAudio> {
  const durationMs = durationForVerse(normalizedWords(verse).length, options.intro);
  const introStyles = options.intro
    ? ["two seconds of silence before the first vocal bar", "no instrumental pickup"]
    : ["start vocals immediately"];
  const echoStyles = options.echoOut
    ? ["brief non-verbal reverb tail after the final word", "do not repeat or echo any lyric words"]
    : ["clean dry ending with no vocal echo"];
  const response = await fetch(`${ELEVENLABS_BASE_URL}/v1/music?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "xi-api-key": providerKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      composition_plan: {
        chunks: formatVerseBars(verse).map((bar, index) => ({
            text: bar,
            duration_ms: durationForVerse(normalizedWords(bar).length, options.intro && index === 0),
            positive_styles: [
              "modern hip hop",
              "clear rhythmic rap delivery",
              "dry isolated a cappella spoken rap vocal",
              "close-mic studio voice",
              "no instrumental accompaniment",
              ...introStyles,
              ...echoStyles,
            ],
            negative_styles: [
              "no extra lyrics",
              "no ad libs",
              "no backing vocals",
              "no singing",
              "no drums",
              "no beat",
              "no bass",
              "no instruments",
            ],
            context_adherence: "high",
          })),
      },
      model_id: MUSIC_MODEL,
      seed: MUSIC_GENERATION_SEED,
      store_for_inpainting: false,
    }),
    signal,
  });
  if (!response.ok) throw await providerError(response, "music-generation");
  const cost = providerCost(response.headers);
  return {
    audio: Buffer.from(await response.arrayBuffer()),
    providerHttpStatus: response.status,
    generationCostUsd: cost.usd,
    generationCostHeader: cost.header,
    durationMs,
    provenance: "generated",
  };
}

async function generateInstrumentalBeat(durationMs: number, signal: AbortSignal): Promise<GeneratedAudio> {
  const response = await fetch(`${ELEVENLABS_BASE_URL}/v1/music?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "xi-api-key": providerKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      composition_plan: {
        chunks: [
          {
            text: "[Instrumental only]",
            duration_ms: durationMs,
            positive_styles: [
              "instrumental boom bap hip hop beat",
              "steady drums and warm bass",
              "no vocals or speech",
              "supportive backing track with space for a rap vocal",
            ],
            negative_styles: ["vocals", "speech", "spoken words", "singing", "ad libs"],
            context_adherence: "high",
          },
        ],
      },
      model_id: MUSIC_MODEL,
      seed: MUSIC_GENERATION_SEED,
      store_for_inpainting: false,
    }),
    signal,
  });
  if (!response.ok) throw await providerError(response, "music-generation");
  const cost = providerCost(response.headers);
  return {
    audio: Buffer.from(await response.arrayBuffer()),
    providerHttpStatus: response.status,
    generationCostUsd: cost.usd,
    generationCostHeader: cost.header,
    durationMs,
    provenance: "generated",
  };
}

function addCosts(first: number | null, second: number | null): number | null {
  if (first === null && second === null) return null;
  return (first ?? 0) + (second ?? 0);
}

export async function mixAudioWithBeat(
  vocal: Buffer,
  beat: Buffer,
  signal: AbortSignal,
): Promise<Buffer> {
  if (signal.aborted) throw new Error("Audio mixing was cancelled.");
  const workingDirectory = await mkdtemp(join(tmpdir(), "lyriclab-audio-mix-"));
  const vocalPath = join(workingDirectory, "dry-vocal.mp3");
  const beatPath = join(workingDirectory, "generated-beat.mp3");

  try {
    await Promise.all([writeFile(vocalPath, vocal), writeFile(beatPath, beat)]);
    if (signal.aborted) throw new Error("Audio mixing was cancelled.");

    const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
    return await new Promise((resolve, reject) => {
      const mixer = spawn(
        ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          vocalPath,
          "-i",
          beatPath,
          "-filter_complex",
          "[1:a]volume=-12dB,apad[bed];[0:a][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mix]",
          "-map",
          "[mix]",
          "-ar",
          "44100",
          "-ac",
          "2",
          "-c:a",
          "libmp3lame",
          "-b:a",
          "128k",
          "-f",
          "mp3",
          "pipe:1",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const output: Buffer[] = [];
      let errorOutput = "";
      let settled = false;

      const removeAbortListener = () => signal.removeEventListener("abort", handleAbort);
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        removeAbortListener();
        reject(error);
      };
      const handleAbort = () => mixer.kill("SIGTERM");

      signal.addEventListener("abort", handleAbort, { once: true });
      mixer.stdout.on("data", (chunk: Buffer) => output.push(Buffer.from(chunk)));
      mixer.stderr.on("data", (chunk: Buffer) => {
        errorOutput = `${errorOutput}${chunk.toString("utf8")}`.slice(-1_000);
      });
      mixer.on("error", fail);
      mixer.on("close", (code) => {
        if (settled) return;
        settled = true;
        removeAbortListener();
        if (signal.aborted) {
          reject(new Error("Audio mixing was cancelled."));
          return;
        }
        if (code !== 0) {
          reject(new Error(`FFmpeg audio mix failed: ${errorOutput.trim() || `exit code ${code}`}`));
          return;
        }
        resolve(Buffer.concat(output));
      });
    });
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

export type SingleMusicGenerationDiagnostic = {
  success: boolean;
  elapsedMs: number;
  providerHttpStatus: number | null;
  audioBytes: number | null;
  generationCostUsd: number | null;
  generationCostHeader: string | null;
  providerError: PerformanceTakeLog["providerError"];
};

export async function diagnoseSingleMusicGeneration(
  verse: string,
  options: PerformanceOptions,
): Promise<SingleMusicGenerationDiagnostic> {
  const startedAt = Date.now();
  try {
    const generated = await generateAudio(verse, options, new AbortController().signal);
    return {
      success: true,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      providerHttpStatus: generated.providerHttpStatus,
      audioBytes: generated.audio.length,
      generationCostUsd: generated.generationCostUsd,
      generationCostHeader: generated.generationCostHeader,
      providerError: null,
    };
  } catch (error) {
    if (!(error instanceof ProviderRequestError)) throw error;
    return {
      success: false,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      providerHttpStatus: error.httpStatus,
      audioBytes: null,
      generationCostUsd: error.cost.usd,
      generationCostHeader: error.cost.header,
      providerError: {
        service: error.service,
        httpStatus: error.httpStatus,
        bodyPreview: error.bodyPreview,
        transportError: null,
      },
    };
  }
}

async function transcribeAudio(audio: Buffer, signal: AbortSignal): Promise<{
  transcriptionCostUsd: number | null;
  transcriptionCostHeader: string | null;
  transcript: string;
  words: TranscribedWord[];
}> {
  assertAudioMayBeSentToAi("generated");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio).buffer as ArrayBuffer], { type: "audio/mpeg" }), "performance.mp3");
  form.append("model_id", TRANSCRIPTION_MODEL);
  form.append("timestamps_granularity", "word");
  const response = await fetch(`${ELEVENLABS_BASE_URL}/v1/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": providerKey(), Accept: "application/json" },
    body: form,
    signal,
  });
  if (!response.ok) throw await providerError(response, "transcription");
  const payload = await response.json();
  const transcription = readTranscription(payload);
  const cost = providerCost(response.headers);
  return {
    transcriptionCostUsd: cost.usd,
    transcriptionCostHeader: cost.header,
    transcript: transcription.text,
    words: transcription.words,
  };
}

class QualityRejectedError extends Error {
  constructor(readonly failedChecks: PerformanceQualityCheck[]) {
    super(`Verse take failed quality checks: ${failedChecks.join(", ")}.`);
    this.name = "QualityRejectedError";
  }
}

function emptyAssessment(wordsExpected: number): PerformanceQualityAssessment {
  return {
    failedChecks: [],
    wordsMatched: 0,
    wordsExpected,
    voiceSpanRatio: 0,
    audibleWordRatio: 0,
    maxSpeechGapSeconds: 0,
    eatenWordCount: 0,
    lowConfidenceWordCount: 0,
    confidenceWordCount: 0,
  };
}

export async function generatePassingTake(
  verse: string,
  options: PerformanceOptions,
  onTakeLog?: TakeLogCallback,
  runOptions: { maxPairs?: number } = {},
): Promise<ProviderTake> {
  const expected = normalizedWords(verse);
  const expectedOriginal = originalWords(verse);
  const deadline = Date.now() + 90_000;
  const controllers = new Set<AbortController>();
  const backingController = new AbortController();
  let backingAudioPromise: Promise<GeneratedAudio> | null = null;
  const getBackingTrack = (): Promise<GeneratedAudio> => {
    backingAudioPromise ??= generateInstrumentalBeat(
      durationForVerse(expected.length, options.intro),
      backingController.signal,
    );
    return backingAudioPromise;
  };
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let nextAttempt = 0;
  let pairsStarted = 0;
  const maxPairs = runOptions.maxPairs === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(1, Math.floor(runOptions.maxPairs));
  const runTake = async (): Promise<ProviderTake> => {
    const attempt = ++nextAttempt;
    const startedAt = Date.now();
    const controller = new AbortController();
    controllers.add(controller);
    let stage: PerformanceTakeLog["rejectedCheck"] = "music-generation";
    let rejectedCheck: PerformanceTakeLog["rejectedCheck"] = null;
    let failedChecks: PerformanceQualityCheck[] = [];
    let accepted = false;
    let assessment = emptyAssessment(expected.length);
    let generationStartedAt: number | null = null;
    let transcriptionStartedAt: number | null = null;
    let generationElapsedMs: number | null = null;
    let transcriptionElapsedMs: number | null = null;
    let generationCostHeader: string | null = null;
    let transcriptionCostHeader: string | null = null;
    let generationCostUsd: number | null = null;
    let transcriptionCostUsd: number | null = null;
    let providerErrorLog: PerformanceTakeLog["providerError"] = null;
    let mismatches: PerformanceWordMismatch[] = [];
    let wordsMatched = 0;
    try {
      generationStartedAt = Date.now();
      const generated = await generateAudio(verse, options, controller.signal);
      generationElapsedMs = Math.max(0, Date.now() - generationStartedAt);
      generationStartedAt = null;
      generationCostHeader = generated.generationCostHeader;
      generationCostUsd = generated.generationCostUsd;

      stage = "transcription";
      transcriptionStartedAt = Date.now();
      const transcription = await transcribeAudio(generated.audio, controller.signal);
      transcriptionElapsedMs = Math.max(0, Date.now() - transcriptionStartedAt);
      transcriptionStartedAt = null;
      transcriptionCostHeader = transcription.transcriptionCostHeader;
      transcriptionCostUsd = transcription.transcriptionCostUsd;
      const delivered = transcription.words.map((word) => normalizeWord(word.text)).filter(Boolean);
      const heardOriginal = transcription.words
        .map((word) => word.text)
        .filter((word) => normalizeWord(word).length > 0);
      mismatches = wordMismatches(expectedOriginal, heardOriginal);
      wordsMatched = expected.length - mismatches.filter((mismatch) => mismatch.kind !== "extra").length;

      stage = "audio-analysis";
      const decoded = await decodeAudioForAnalysis(generated.audio, controller.signal);
      if (controller.signal.aborted) throw new Error("Performance attempt was cancelled.");
      assessment = assessPerformanceQuality({
        expectedWords: expected,
        words: transcription.words,
        audioSamples: decoded.samples,
        sampleRate: decoded.sampleRate,
        intro: options.intro,
        echoOut: options.echoOut,
      });
      wordsMatched = assessment.wordsMatched;
      failedChecks = assessment.failedChecks;
      if (failedChecks.length > 0) {
        rejectedCheck = failedChecks[0];
        throw new QualityRejectedError(failedChecks);
      }

      stage = "music-generation";
      generationStartedAt = Date.now();
      const beat = await getBackingTrack();
      generationElapsedMs = (generationElapsedMs ?? 0) + Math.max(0, Date.now() - generationStartedAt);
      generationStartedAt = null;
      const beatManifest: AudioBeatManifest = {
        version: 1,
        outputId: "performance-mix",
        sources: [
          { id: "dry-rap-vocal", provenance: generated.provenance },
          { id: "generated-instrumental-beat", provenance: beat.provenance },
        ],
      };
      assertBeatManifestAllowed(beatManifest);
      const mixedAudio = await mixAudioWithBeat(generated.audio, beat.audio, controller.signal);
      stage = "audio-analysis";
      if (Date.now() >= deadline) {
        rejectedCheck = "deadline";
        throw new Error("Performance deadline reached.");
      }
      accepted = true;
      return {
        audio: mixedAudio,
        audioProvenance: "composite",
        beatManifest,
        generationCostUsd: addCosts(generated.generationCostUsd, beat.generationCostUsd),
        transcriptionCostUsd,
        transcript: transcription.transcript,
        wordTexts: delivered,
        durationMs: Math.round((decoded.samples.length / decoded.sampleRate) * 1_000),
      };
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        providerErrorLog = {
          service: error.service,
          httpStatus: error.httpStatus,
          bodyPreview: error.bodyPreview,
          transportError: null,
        };
        if (stage === "music-generation") {
          generationCostHeader = error.cost.header;
          generationCostUsd = error.cost.usd;
        } else if (stage === "transcription") {
          transcriptionCostHeader = error.cost.header;
          transcriptionCostUsd = error.cost.usd;
        }
      } else if (
        !controller.signal.aborted &&
        (stage === "music-generation" || stage === "transcription")
      ) {
        providerErrorLog = {
          service: stage,
          httpStatus: null,
          bodyPreview: null,
          transportError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        };
      }
      if (error instanceof QualityRejectedError) {
        failedChecks = error.failedChecks;
        rejectedCheck = failedChecks[0] ?? "fidelity";
      } else if (controller.signal.aborted) {
        rejectedCheck = "cancelled";
      } else if (rejectedCheck === null) {
        rejectedCheck = stage;
      }
      throw error;
    } finally {
      if (generationStartedAt !== null) {
        generationElapsedMs = Math.max(0, Date.now() - generationStartedAt);
      }
      if (transcriptionStartedAt !== null) {
        transcriptionElapsedMs = Math.max(0, Date.now() - transcriptionStartedAt);
      }
      try {
        onTakeLog?.({
          attempt,
          elapsedMs: Math.max(0, Date.now() - startedAt),
          generationElapsedMs,
          transcriptionElapsedMs,
          wordsMatched,
          wordsExpected: assessment.wordsExpected,
          rejectedCheck,
          failedChecks,
          mismatches,
          accepted,
          generationCostHeader,
          transcriptionCostHeader,
          generationCostUsd,
          transcriptionCostUsd,
          voiceSpanRatio: assessment.voiceSpanRatio,
          audibleWordRatio: assessment.audibleWordRatio,
          maxSpeechGapSeconds: assessment.maxSpeechGapSeconds,
          eatenWordCount: assessment.eatenWordCount,
          lowConfidenceWordCount: assessment.lowConfidenceWordCount,
          confidenceWordCount: assessment.confidenceWordCount,
          providerError: providerErrorLog,
        });
      } finally {
        controllers.delete(controller);
      }
    }
  };

  try {
    while (Date.now() < deadline && pairsStarted < maxPairs) {
      pairsStarted += 1;
      const pair = [runTake(), runTake()];
      const pairResult = Promise.any(pair);
      const remainingMs = Math.max(1, deadline - Date.now());
      const timeout = new Promise<never>((_, reject) => {
        deadlineTimer = setTimeout(() => {
          controllers.forEach((controller) => controller.abort());
          backingController.abort();
          reject(new Error("Performance deadline reached."));
        }, remainingMs);
      });
      try {
        const take = await Promise.race([pairResult, timeout]);
        controllers.forEach((controller) => controller.abort());
        return take;
      } catch {
        await Promise.allSettled(pair);
      } finally {
        if (deadlineTimer) clearTimeout(deadlineTimer);
      }
    }
  } finally {
    controllers.forEach((controller) => controller.abort());
    backingController.abort();
  }

  throw new Error("The verse could not be mastered exactly right now.");
}