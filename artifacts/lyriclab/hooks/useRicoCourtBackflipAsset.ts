import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { getCachedRicoCourtBackflipUri } from "@/services/ricoMoves";

type RicoCourtBackflipAssetState = {
  uri: string | null;
  loading: boolean;
  error: Error | null;
};

export function useRicoCourtBackflipAsset(): RicoCourtBackflipAssetState {
  const [state, setState] = useState<RicoCourtBackflipAssetState>({
    uri: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    setState({ uri: null, loading: true, error: null });
    void getCachedRicoCourtBackflipUri()
      .then((uri) => {
        if (cancelled) {
          if (Platform.OS === "web") URL.revokeObjectURL(uri);
          return;
        }
        if (Platform.OS === "web") objectUrl = uri;
        setState({ uri, loading: false, error: null });
      })
      .catch((error: unknown) => {
        const normalized =
          error instanceof Error
            ? error
            : new Error("RICO's court backflip could not be loaded.");
        console.warn("[RICO court move] Failed to cache backflip.", normalized.message);
        if (!cancelled) setState({ uri: null, loading: false, error: normalized });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  return state;
}