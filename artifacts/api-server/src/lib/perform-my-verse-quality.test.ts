import assert from "node:assert/strict";
import {
  assessPerformanceQuality,
  PERFORMANCE_SAMPLE_RATE,
  type TranscribedWord,
} from "./perform-my-verse-quality";
import {
  decodeAudioForAnalysis,
  generatePassingTake,
  mixAudioWithBeat,
  type PerformanceTakeLog,
} from "./perform-my-verse";

const expectedWords = ["we", "make", "beats", "and", "move", "with", "clear", "words"];

function timedWords(): TranscribedWord[] {
  return expectedWords.map((text, index) => {
    const startSeconds = 0.8 + index * 0.9;
    return {
      text,
      startSeconds,
      endSeconds: startSeconds + 0.3,
      logProbability: Math.log(0.92),
    };
  });
}

function speechLikeAudio(durationSeconds: number): Int16Array {
  const samples = new Int16Array(durationSeconds * PERFORMANCE_SAMPLE_RATE);
  const speechStart = 0.7;
  const speechEnd = durationSeconds - 1.1;
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / PERFORMANCE_SAMPLE_RATE;
    if (time < speechStart || time > speechEnd) continue;
    const envelope = 0.72 + 0.18 * Math.sin(2 * Math.PI * 4.5 * time);
    const voicedSignal =
      Math.sin(2 * Math.PI * 145 * time) * 0.42 +
      Math.sin(2 * Math.PI * 290 * time) * 0.2 +
      Math.sin(2 * Math.PI * 435 * time) * 0.1;
    samples[index] = Math.round(18_000 * envelope * voicedSignal);
  }
  return samples;
}

function waveFile(samples: Int16Array): Buffer {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) pcm.writeInt16LE(samples[index], index * 2);

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(PERFORMANCE_SAMPLE_RATE, 24);
  header.writeUInt32LE(PERFORMANCE_SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const commonInput = {
  expectedWords,
  words: timedWords(),
  sampleRate: PERFORMANCE_SAMPLE_RATE,
  intro: true,
  echoOut: true,
};

const silenceAssessment = assessPerformanceQuality({
  ...commonInput,
  audioSamples: new Int16Array(9 * PERFORMANCE_SAMPLE_RATE),
});
assert.ok(silenceAssessment.failedChecks.includes("has-voice"), "silence-only audio must fail has-voice");
assert.deepEqual(silenceAssessment.failedChecks, ["has-voice"]);

const normalAssessment = assessPerformanceQuality({
  ...commonInput,
  audioSamples: speechLikeAudio(9),
});
assert.deepEqual(normalAssessment.failedChecks, [], "a voiced take with clear, fully timed words should pass");
assert.equal(normalAssessment.wordsMatched, expectedWords.length);
assert.ok(normalAssessment.audibleWordRatio >= 0.75);

const swallowedAssessment = assessPerformanceQuality({
  ...commonInput,
  words: timedWords().filter((_, index) => index !== 3),
  audioSamples: speechLikeAudio(9),
});
assert.ok(swallowedAssessment.failedChecks.includes("eaten"), "a missing expected word must fail eaten");

const nearZeroWords = timedWords();
nearZeroWords[3] = { ...nearZeroWords[3], endSeconds: nearZeroWords[3].startSeconds! + 0.01 };
const nearZeroAssessment = assessPerformanceQuality({
  ...commonInput,
  words: nearZeroWords,
  audioSamples: speechLikeAudio(9),
});
assert.ok(nearZeroAssessment.failedChecks.includes("eaten"), "a near-zero-duration word must fail eaten");

const lowConfidenceWords = timedWords().map((word, index) =>
  index < 3 ? { ...word, logProbability: Math.log(0.2) } : word,
);
const dictionAssessment = assessPerformanceQuality({
  ...commonInput,
  words: lowConfidenceWords,
  audioSamples: speechLikeAudio(9),
});
assert.ok(dictionAssessment.failedChecks.includes("diction"), "low confidence across many words must fail diction");

async function verifyProviderErrorTakeLogs(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.ELEVENLABS_API_KEY;
  const logs: PerformanceTakeLog[] = [];
  const verse = [
    "I step in the booth with the fire in my lungs",
    "Every word that I write is a spark on my tongue",
    "Late nights on the court where the real ones are made",
    "Now I'm lighting up the beat and I'm never gonna fade",
  ].join("\n");
  const options = { intro: true, echoOut: true };
  const musicErrorBody = `music provider rejection: ${"m".repeat(520)}`;
  const transcriptionErrorBody = `transcription provider rejection: ${"s".repeat(520)}`;

  process.env.ELEVENLABS_API_KEY = "unit-test-only";
  try {
    globalThis.fetch = async () => new Response(musicErrorBody, { status: 503 });
    await assert.rejects(
      generatePassingTake(verse, options, (entry) => logs.push(entry), { maxPairs: 1 }),
      /could not be mastered/,
    );
    assert.equal(logs.length, 2, "one diagnostic pair must write two take logs");
    for (const entry of logs) {
      assert.deepEqual(entry.providerError, {
        service: "music-generation",
        httpStatus: 503,
        bodyPreview: musicErrorBody.slice(0, 500),
        transportError: null,
      });
    }

    logs.length = 0;
    globalThis.fetch = async (input) => {
      if (String(input).includes("/v1/music?")) {
        return new Response(Uint8Array.from([73, 68, 51]), {
          status: 200,
          headers: { "x-cost-usd": "0.01" },
        });
      }
      return new Response(transcriptionErrorBody, { status: 401 });
    };
    await assert.rejects(
      generatePassingTake(verse, options, (entry) => logs.push(entry), { maxPairs: 1 }),
      /could not be mastered/,
    );
    assert.equal(logs.length, 2, "transcription failures must also write both take logs");
    for (const entry of logs) {
      assert.deepEqual(entry.providerError, {
        service: "transcription",
        httpStatus: 401,
        bodyPreview: transcriptionErrorBody.slice(0, 500),
        transportError: null,
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalApiKey;
  }
}

async function verifyFfmpegDecode(): Promise<void> {
  const decoded = await decodeAudioForAnalysis(waveFile(speechLikeAudio(9)), new AbortController().signal);
  assert.equal(decoded.sampleRate, PERFORMANCE_SAMPLE_RATE);
  assert.equal(decoded.samples.length, 9 * PERFORMANCE_SAMPLE_RATE);
  const decodedAssessment = assessPerformanceQuality({
    ...commonInput,
    audioSamples: decoded.samples,
  });
  assert.deepEqual(decodedAssessment.failedChecks, [], "decoded synthetic voiced audio should pass");
  const mixed = await mixAudioWithBeat(
    waveFile(speechLikeAudio(9)),
    waveFile(speechLikeAudio(5)),
    new AbortController().signal,
  );
  assert.ok(mixed.length > 0, "post-generation vocal/beat mix should produce audio");
  const decodedMix = await decodeAudioForAnalysis(mixed, new AbortController().signal);
  assert.ok(
    Math.abs(decodedMix.samples.length / decodedMix.sampleRate - 9) < 0.1,
    "mix duration should follow the vocal and pad a shorter beat",
  );
  await verifyProviderErrorTakeLogs();
  console.log("perform-my-verse quality gates: PASS");
}

void verifyFfmpegDecode().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});