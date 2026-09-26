import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;
if (!serviceRoleKey) {
  throw new Error("The API server does not have its configured Supabase service-role secret.");
}

const projectUrl = (
  process.env.SUPABASE_URL ??
  process.env.SUPABASE_PROJECT_URL ??
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  "https://tnshtklviovkcboypyfj.supabase.co"
).replace(/\/+$/, "");

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "../../..");
const bucket = "lyriclab-share-videos";
const uploads = [
  {
    file: path.join(workspaceRoot, "RUN-COURTMOVE1-work/court/rico-backflip.mp4"),
    objectPath: "moves/court/rico-backflip.mp4",
  },
  {
    file: path.join(workspaceRoot, "RUN-COURTMOVE1-demo.mp4"),
    objectPath: "moves/rico/rico-courtmove1-immediate-tap-demo.mp4",
  },
];

let uploadedCount = 0;
for (const upload of uploads) {
  let body;
  try {
    body = await readFile(upload.file);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      continue;
    }
    throw error;
  }
  if (body.length === 0) {
    throw new Error(`Refusing to upload an empty file: ${upload.objectPath}`);
  }

  const encodedPath = upload.objectPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const response = await fetch(
    `${projectUrl}/storage/v1/object/${bucket}/${encodedPath}`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "video/mp4",
        "Cache-Control": "31536000",
        "x-upsert": "true",
      },
      body,
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Supabase Storage upload failed for ${upload.objectPath} (HTTP ${response.status}).`);
  }

  const publicUrl = `${projectUrl}/storage/v1/object/public/${bucket}/${encodedPath}`;
  const verification = await fetch(publicUrl, {
    method: "HEAD",
    signal: AbortSignal.timeout(30_000),
  });
  const reportedSize = Number(verification.headers.get("content-length"));
  if (!verification.ok || (reportedSize > 0 && reportedSize !== body.length)) {
    throw new Error(`Public verification failed for ${upload.objectPath} (HTTP ${verification.status}).`);
  }

  uploadedCount += 1;
  console.log(`Uploaded ${upload.objectPath}: ${body.length} bytes; public HEAD ${verification.status}.`);
}

if (uploadedCount === 0) {
  const source = uploads[0].objectPath;
  throw new Error(`No RUN-COURTMOVE1 media files were found to upload; expected ${source}.`);
}

console.log(`RUN-COURTMOVE1 server-side upload finished (${uploadedCount} file(s)).`);