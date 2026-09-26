import { useGetPrelaunchAccess, useGetPrelaunchStatus } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";

type ErrorRecord = Record<string, unknown>;

function asRecord(value: unknown): ErrorRecord | null {
  return value !== null && typeof value === "object"
    ? (value as ErrorRecord)
    : null;
}

function isPrelaunchDenied(error: unknown): boolean {
  const record = asRecord(error);
  const data = asRecord(record?.data);
  return record?.status === 403 && data?.code === "PRELAUNCH_BLOCKED";
}

export function usePrelaunchAccess() {
  const { session } = useAuth();
  const statusQuery = useGetPrelaunchStatus({
    query: {
      queryKey: ["prelaunch-status"],
      retry: false,
      staleTime: 0,
      refetchInterval: 30_000,
    },
  });
  const isEnabled = statusQuery.data?.enabled === true;
  const accessQuery = useGetPrelaunchAccess({
    query: {
      queryKey: ["prelaunch-access", session?.user.id ?? "signed-out"],
      enabled: isEnabled && Boolean(session),
      retry: false,
      staleTime: 0,
      refetchInterval: 30_000,
    },
  });

  const mode =
    statusQuery.isPending
      ? "checking"
      : statusQuery.isError
        ? "error"
        : isEnabled
          ? "on"
          : "off";

  const access =
    mode !== "on"
      ? mode === "off"
        ? "allowed"
        : "checking"
      : !session
        ? "signed-out"
        : isPrelaunchDenied(accessQuery.error)
          ? "blocked"
          : accessQuery.isError
            ? "error"
            : accessQuery.data?.enabled === true &&
                accessQuery.data.allowed === true &&
                accessQuery.data.userId === session.user.id
              ? "allowed"
              : "checking";

  return {
    mode,
    access,
    canUseApp: mode === "off" || (mode === "on" && access === "allowed"),
    needsSignIn: mode === "on" && !session,
    retry: () => {
      void statusQuery.refetch();
      if (session) void accessQuery.refetch();
    },
  } as const;
}