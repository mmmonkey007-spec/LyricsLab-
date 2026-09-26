export const PERFORMANCE_SAMPLE_RATE = 16_000;

const MIN_WORD_DURATION_SECONDS = 0.04;
const MIN_WORD_AUDIO_RMS = 0.006;
const MIN_TRANSCRIPT_SPAN_RATIO = 0.55;
const MIN_AUDIBLE_WORD_RATIO = 0.75;
const MAX_INTERNAL_SPEECH_GAP_SECONDS = 2.5;
const LOW_WORD_CONFIDENCE = 0.55;
const LOW_CONFIDENCE_WORD_RATIO = 0.3;
const MIN_LOW_CONFIDENCE_WORDS = 2;

export type TranscribedWord = {
  text: string;
  startSeconds: number | null;
  endSeconds: number | null;
  logProbability: number | null;
};

export type PerformanceQualityCheck = "has-voice" | "eaten" | "diction" | "fidelity";

export type PerformanceQualityAssessment = {
  failedChecks: PerformanceQualityCheck[];
  wordsMatched: number;
  wordsExpected: number;
  voiceSpanRatio: number;
  audibleWordRatio: number;
  maxSpeechGapSeconds: number;
  eatenWordCount: number;
  lowConfidenceWordCount: number;
  confidenceWordCount: number;
};

export function normalizePerformanceWord(word: string): string {
  return word
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function hasValidTiming(word: TranscribedWord, durationSeconds: number): boolean {
  return (
    word.startSeconds !== null &&
    word.endSeconds !== null &&
    Number.isFinite(word.startSeconds) &&
    Number.isFinite(word.endSeconds) &&
    word.startSeconds >= 0 &&
    word.endSeconds <= durationSeconds + 0.1 &&
    word.endSeconds - word.startSeconds >= MIN_WORD_DURATION_SECONDS
  );
}

function rmsForInterval(
  samples: Int16Array,
  sampleRate: number,
  startSeconds: number,
  endSeconds: number,
): number {
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const end = Math.min(samples.length, Math.ceil(endSeconds * sampleRate));
  if (end <= start) return 0;

  let sumSquares = 0;
  for (let index = start; index < end; index += 1) {
    const normalized = samples[index] / 32_768;
    sumSquares += normalized * normalized;
  }
  return Math.sqrt(sumSquares / (end - start));
}

function alignExpectedWords(expected: string[], words: TranscribedWord[]): Array<number | null> {
  const delivered = words.map((word) => normalizePerformanceWord(word.text));
  const aligned: Array<number | null> = [];
  let nextDeliveredIndex = 0;

  for (const expectedWord of expected) {
    let matchIndex = -1;
    for (let index = nextDeliveredIndex; index < delivered.length; index += 1) {
      if (delivered[index] === expectedWord) {
        matchIndex = index;
        break;
      }
    }
    aligned.push(matchIndex < 0 ? null : matchIndex);
    if (matchIndex >= 0) nextDeliveredIndex = matchIndex + 1;
  }

  return aligned;
}

export function assessPerformanceQuality(input: {
  expectedWords: string[];
  words: TranscribedWord[];
  audioSamples: Int16Array;
  sampleRate: number;
  intro: boolean;
  echoOut: boolean;
}): PerformanceQualityAssessment {
  const { expectedWords, words, audioSamples, sampleRate, intro, echoOut } = input;
  const durationSeconds = sampleRate > 0 ? audioSamples.length / sampleRate : 0;
  const alignedIndexes = alignExpectedWords(expectedWords, words);
  const wordsMatched = alignedIndexes.filter((index) => index !== null).length;
  const expectedTimedWords = alignedIndexes
    .map((index) => (index === null ? null : words[index]))
    .filter((word): word is TranscribedWord => word !== null && hasValidTiming(word, durationSeconds))
    .sort((left, right) => left.startSeconds! - right.startSeconds!);

  const introAllowance = Math.min(intro ? 2.6 : 0.8, durationSeconds * 0.35);
  const outroAllowance = Math.min(echoOut ? 2 : 0.8, durationSeconds * 0.25);
  const availableSpeechSeconds = Math.max(
    durationSeconds * 0.25,
    durationSeconds - introAllowance - outroAllowance,
  );
  const firstWord = expectedTimedWords[0];
  const lastWord = expectedTimedWords.at(-1);
  const voiceSpanSeconds =
    firstWord && lastWord ? Math.max(0, lastWord.endSeconds! - firstWord.startSeconds!) : 0;
  const voiceSpanRatio = durationSeconds > 0
    ? Math.min(1, voiceSpanSeconds / availableSpeechSeconds)
    : 0;

  let maxSpeechGapSeconds = 0;
  for (let index = 1; index < expectedTimedWords.length; index += 1) {
    const gap = expectedTimedWords[index].startSeconds! - expectedTimedWords[index - 1].endSeconds!;
    maxSpeechGapSeconds = Math.max(maxSpeechGapSeconds, gap);
  }

  const audibleWordCount = expectedTimedWords.filter(
    (word) => rmsForInterval(audioSamples, sampleRate, word.startSeconds!, word.endSeconds!) >= MIN_WORD_AUDIO_RMS,
  ).length;
  const audibleWordRatio = expectedTimedWords.length > 0
    ? audibleWordCount / expectedTimedWords.length
    : 0;
  const leadingSilence = firstWord ? firstWord.startSeconds! : Number.POSITIVE_INFINITY;
  const trailingSilence = lastWord ? durationSeconds - lastWord.endSeconds! : Number.POSITIVE_INFINITY;
  const hasVoice =
    durationSeconds > 0 &&
    expectedTimedWords.length >= Math.max(1, Math.ceil(expectedWords.length * MIN_AUDIBLE_WORD_RATIO)) &&
    voiceSpanRatio >= MIN_TRANSCRIPT_SPAN_RATIO &&
    maxSpeechGapSeconds <= MAX_INTERNAL_SPEECH_GAP_SECONDS &&
    leadingSilence <= introAllowance + 0.5 &&
    trailingSilence <= outroAllowance + 0.5 &&
    audibleWordRatio >= MIN_AUDIBLE_WORD_RATIO;

  let eatenWordCount = 0;
  for (const deliveredIndex of alignedIndexes) {
    if (deliveredIndex === null || !hasValidTiming(words[deliveredIndex], durationSeconds)) {
      eatenWordCount += 1;
    }
  }

  const confidences = alignedIndexes
    .map((index) => (index === null ? null : words[index].logProbability))
    .filter((value): value is number => value !== null && (Number.isFinite(value) || value === Number.NEGATIVE_INFINITY) && value <= 0)
    .map((logProbability) => Math.exp(logProbability));
  const confidenceWordCount = confidences.length;
  const lowConfidenceWordCount = confidences.filter((confidence) => confidence < LOW_WORD_CONFIDENCE).length;
  const confidenceCoverage = expectedWords.length > 0 ? confidenceWordCount / expectedWords.length : 0;
  const minLowConfidenceWords = Math.max(
    MIN_LOW_CONFIDENCE_WORDS,
    Math.ceil(expectedWords.length * LOW_CONFIDENCE_WORD_RATIO),
  );
  const dictionPassed =
    expectedWords.length > 0 &&
    confidenceCoverage >= MIN_AUDIBLE_WORD_RATIO &&
    lowConfidenceWordCount < minLowConfidenceWords;

  const deliveredWords = words.map((word) => normalizePerformanceWord(word.text));
  const fidelityPassed =
    expectedWords.length === deliveredWords.length &&
    expectedWords.every((word, index) => word === deliveredWords[index]);

  const failedChecks: PerformanceQualityCheck[] = [];
  if (!hasVoice) failedChecks.push("has-voice");
  if (eatenWordCount > 0) failedChecks.push("eaten");
  if (!dictionPassed) failedChecks.push("diction");
  if (!fidelityPassed) failedChecks.push("fidelity");

  return {
    failedChecks,
    wordsMatched,
    wordsExpected: expectedWords.length,
    voiceSpanRatio,
    audibleWordRatio,
    maxSpeechGapSeconds,
    eatenWordCount,
    lowConfidenceWordCount,
    confidenceWordCount,
  };
}