import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { supabase } from "@/services/supabase";

const BUCKET = "lyriclab-share-videos";
const STORAGE_PATH = "moves/court/rico-backflip.mp4";
const WEB_CACHE_NAME = "lyriclab-rico-court-moves-v1";

export const RICO_COURT_LAST_FRAME_HOLD_MS = 500;

const pendingDownloads = new Map<string, Promise<string>>();

function publicUrl(): string {
  return supabase.storage.from(BUCKET).getPublicUrl(STORAGE_PATH).data.publicUrl;
}

async function getWebCachedUri(): Promise<string> {
  const cacheStorage = globalThis.caches;
  if (!cacheStorage) {
    throw new Error("Persistent browser caching is unavailable.");
  }

  const url = publicUrl();
  const cache = await cacheStorage.open(WEB_CACHE_NAME);
  let response = await cache.match(url);

  if (!response) {
    response = await fetch(url);
    if (!response.ok) {
      throw new Error(`RICO's court backflip could not be downloaded (${response.status}).`);
    }
    await cache.put(url, response.clone());
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error("RICO's court backflip downloaded as an empty file.");
  }
  return URL.createObjectURL(blob);
}

async function downloadNativeClip(): Promise<string> {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error("Device storage is unavailable.");
  }

  const directory = `${root}rico-moves/court/`;
  const target = `${directory}rico-backflip.mp4`;
  const temporary = `${target}.partial`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  const existing = await FileSystem.getInfoAsync(target);
  if (existing.exists && existing.size && existing.size > 0) {
    return target;
  }

  const partial = await FileSystem.getInfoAsync(temporary);
  if (partial.exists) {
    await FileSystem.deleteAsync(temporary, { idempotent: true });
  }

  try {
    const result = await FileSystem.downloadAsync(publicUrl(), temporary);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`RICO's court backflip could not be downloaded (${result.status}).`);
    }

    const downloaded = await FileSystem.getInfoAsync(temporary);
    if (!downloaded.exists || !downloaded.size || downloaded.size <= 0) {
      throw new Error("RICO's court backflip downloaded as an empty file.");
    }

    if (existing.exists) {
      await FileSystem.deleteAsync(target, { idempotent: true });
    }
    await FileSystem.moveAsync({ from: temporary, to: target });
    return target;
  } catch (error) {
    await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
    throw error;
  }
}

export function getCachedRicoCourtBackflipUri(): Promise<string> {
  const key = Platform.OS === "web" ? "web" : Platform.OS;
  const pending = pendingDownloads.get(key);
  if (pending) return pending;

  const download = Platform.OS === "web" ? getWebCachedUri() : downloadNativeClip();
  pendingDownloads.set(key, download);
  return download.finally(() => {
    if (pendingDownloads.get(key) === download) {
      pendingDownloads.delete(key);
    }
  });
}