import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CACHE_ROOT = join(tmpdir(), "lyriclab-performance-share-videos");
const rendersInFlight = new Map<string, Promise<Buffer>>();
const RENDER_VERSION = "v3";
const COURT_ART_CANDIDATES = [
  join(process.cwd(), "../lyriclab/assets/court/court-with-cast.png"),
  join(process.cwd(), "artifacts/lyriclab/assets/court/court-with-cast.png"),
];

export interface PerformanceShareScore {
  finalScore: number;
  winner: "player" | "opponent" | "draw";
  tier: string;
}

export interface PerformanceShareVideoInput {
  performanceId: number;
  verse: string;
  audio: Buffer;
  durationMs: number;
  intro?: boolean;
  echoOut?: boolean;
  score?: PerformanceShareScore;
}

function wrapVerse(verse: string, maxCharacters: number): string {
  const lines: string[] = [];
  for (const sourceLine of verse.replace(/\r\n?/g, "\n").trim().split("\n")) {
    const words = sourceLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      if (word.length > maxCharacters) {
        if (line) {
          lines.push(line);
          line = "";
        }
        for (let offset = 0; offset < word.length; offset += maxCharacters) {
          lines.push(word.slice(offset, offset + maxCharacters));
        }
        continue;
      }
      if (!line) {
        line = word;
      } else if (line.length + word.length + 1 <= maxCharacters) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.join("\n");
}

function drawText(
  textPath: string,
  options: {
    x: string;
    y: string;
    size: number;
    color: string;
    align?: "left" | "center";
    enable?: string;
  },
): string {
  return [
    "drawtext=font='DejaVu Sans'",
    `textfile='${escapeFilterPath(textPath)}'`,
    "expansion=none",
    `fontcolor=${options.color}`,
    `fontsize=${options.size}`,
    `x=${options.x}`,
    options.align === "center" ? "text_align=center" : "",
    options.y,
    options.enable ? `enable='${options.enable}'` : "",
  ].filter(Boolean).join(":");
}

function escapeFilterPath(path: string): string {
  return path.replace(/([\\':,])/g, "\\$1");
}

async function courtArtPath(): Promise<string> {
  for (const candidate of COURT_ART_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the other workspace layout before failing explicitly.
    }
  }
  throw new Error("LyricLab court artwork is not available for share-video rendering.");
}

async function createVideo(input: PerformanceShareVideoInput, targetPath: string): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "lyriclab-share-render-"));
  const audioPath = join(workDir, "performance.mp3");
  const logoPath = join(workDir, "logo.txt");
  const taglinePath = join(workDir, "tagline.txt");
  const footerPath = join(workDir, "footer.txt");

  try {
    const lyricText = wrapVerse(input.verse, 30);
    const lyricLines = lyricText.split("\n");
    const lineCount = Math.max(1, lyricLines.length);
    const lineHeight = 62;
    const durationSeconds = Math.max(1, input.durationMs / 1000);
    const lyricViewport = input.score ? 920 : 1120;
    const lyricBlockHeight = lineCount * lineHeight;
    const scrollDistance = Math.max(0, lyricBlockHeight - lyricViewport);
    const lyricBaseY = scrollDistance > 0
      ? `420-t*${(scrollDistance / durationSeconds).toFixed(4)}`
      : String(Math.round(420 + (lyricViewport - lyricBlockHeight) / 2));
    const lyricWords = lyricLines.map((line) => line.trim().split(/\s+/).filter(Boolean).length);
    const totalWords = Math.max(1, lyricWords.reduce((sum, count) => sum + count, 0));
    const lyricStart = input.intro ? Math.min(2, durationSeconds * 0.16) : 0;
    const echoTail = input.echoOut ? Math.min(1, durationSeconds * 0.08) : 0;
    const lyricEnd = Math.max(lyricStart, durationSeconds - echoTail);
    const karaokeDuration = lyricEnd - lyricStart;
    let elapsed = lyricStart;
    const lyricTiming = lyricLines.map((_, index) => {
      const start = elapsed;
      elapsed += karaokeDuration * (lyricWords[index] || 1) / totalWords;
      return { start, end: index === lyricLines.length - 1 ? lyricEnd : elapsed };
    });
    const lyricPaths = await Promise.all(lyricLines.map(async (line, index) => {
      const path = join(workDir, `lyrics-${index}.txt`);
      await writeFile(path, line, "utf8");
      return path;
    }));
    const scoreStart = Math.max(0, durationSeconds - 4);
    const courtPath = await courtArtPath();

    await Promise.all([
      writeFile(audioPath, input.audio),
      writeFile(logoPath, "LYRICLAB", "utf8"),
      writeFile(taglinePath, "YOUR VERSE. YOUR VOICE.", "utf8"),
      writeFile(footerPath, "MADE WITH LYRICLAB", "utf8"),
    ]);

    const lyricFilters = lyricLines.flatMap((_, index) => {
      const timing = lyricTiming[index];
      const y = `y=${lyricBaseY}+${index * lineHeight}`;
      return [
        drawText(lyricPaths[index], { x: "(w-text_w)/2", y, size: 46, color: "white", align: "center" }),
        drawText(lyricPaths[index], {
          x: "(w-text_w)/2",
          y,
          size: 46,
          color: "0xF5C518",
          align: "center",
          enable: `between(t\\,${timing.start.toFixed(3)}\\,${timing.end.toFixed(3)})`,
        }),
      ];
    });
    const drawFilters = [
      "drawbox=x=34:y=34:w=1012:h=1852:color=0x08080D@0.60:t=fill",
      "drawbox=x=34:y=34:w=1012:h=6:color=0xF5C518:t=fill",
      drawText(logoPath, { x: "(w-text_w)/2", y: "y=126", size: 58, color: "0xF5C518", align: "center" }),
      drawText(taglinePath, { x: "(w-text_w)/2", y: "y=218", size: 20, color: "0xD0CFE0", align: "center" }),
      "drawbox=x=110:y=292:w=860:h=2:color=0xF5C518@0.45:t=fill",
      ...lyricFilters,
    ];

    if (input.score) {
      const scorePath = join(workDir, "score.txt");
      const outcomePath = join(workDir, "outcome.txt");
      const tierPath = join(workDir, "tier.txt");
      await Promise.all([
        writeFile(scorePath, String(Math.round(input.score.finalScore)), "utf8"),
        writeFile(
          outcomePath,
          input.score.winner === "draw" ? "DRAW" : input.score.winner === "player" ? "WIN" : "LOSS",
          "utf8",
        ),
        writeFile(tierPath, `${input.score.tier.toUpperCase()} TIER`, "utf8"),
      ]);
      const reveal = `gte(t\\,${scoreStart.toFixed(3)})`;
      const revealProgress = `max(0\\,1-(t-${scoreStart.toFixed(3)})*2)`;
      const panelY = `1430+180*${revealProgress}`;
      const revealY = `1460+120*${revealProgress}`;
      drawFilters.push(
        `drawbox=x=72:y='${panelY}':w=936:h=220:color=0x0B0B12:t=fill:enable='${reveal}'`,
        `drawbox=x=72:y='${panelY}':w=936:h=2:color=0xF5C518:t=fill:enable='${reveal}'`,
        drawText(scorePath, { x: "170", y: `y=${revealY}`, size: 76, color: "0xF5C518", enable: reveal }),
        drawText(outcomePath, {
          x: "490",
          y: `y=${revealY}+20`,
          size: 50,
          color: input.score.winner === "draw"
            ? "0x9B9BAA"
            : input.score.winner === "player"
              ? "0x00F5D4"
              : "0xFF4D6D",
          enable: reveal,
        }),
        drawText(tierPath, { x: "490", y: `y=${revealY}+90`, size: 25, color: "0xB8B8C7", enable: reveal }),
      );
    }

    drawFilters.push(
      "drawbox=x=110:y=1702:w=860:h=2:color=0x333340:t=fill",
      drawText(footerPath, { x: "(w-text_w)/2", y: "y=1740", size: 18, color: "0x9B9BAA", align: "center" }),
    );

    await execFileAsync(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        courtPath,
        "-i",
        audioPath,
        "-filter_complex",
        [
          `[0:v]scale=w='1280+80*sin(t*0.12)':h='1920+120*sin(t*0.12)':eval=frame,crop=1080:1920:x='(iw-ow)/2+sin(t*0.23)*45':y='(ih-oh)/2+cos(t*0.17)*35',drawbox=x=110:y=1255:w=860:h=150:color=0x0B0B12@0.86:t=fill[court]`,
          `[1:a]showfreqs=s=860x120:mode=bar:ascale=sqrt:fscale=log:colors=0xF5C518@0.8,format=rgba[bars]`,
          `[court][bars]overlay=x=110:y=1270:shortest=1[composed]`,
          `[composed]${drawFilters.join(",")}[vout]`,
        ].join(";"),
        "-map",
        "[vout]",
        "-map",
        "1:a:0",
        "-shortest",
        "-t",
        durationSeconds.toFixed(3),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "stillimage",
        "-crf",
        "21",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        targetPath,
      ],
      { timeout: 180_000, maxBuffer: 2_000_000 },
    );

    return await readFile(targetPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function renderPerformanceShareVideo(input: PerformanceShareVideoInput): Promise<Buffer> {
  const withScore = input.score !== undefined;
  const key = `${RENDER_VERSION}:${input.performanceId}:${withScore ? "score" : "rap"}`;
  const targetPath = join(CACHE_ROOT, `${RENDER_VERSION}-${input.performanceId}-${withScore ? "score" : "rap"}.mp4`);
  await mkdir(CACHE_ROOT, { recursive: true });

  try {
    return await readFile(targetPath);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }

  const existing = rendersInFlight.get(key);
  if (existing) return await existing;

  const rendering = createVideo(input, targetPath);
  rendersInFlight.set(key, rendering);
  try {
    return await rendering;
  } finally {
    rendersInFlight.delete(key);
  }
}