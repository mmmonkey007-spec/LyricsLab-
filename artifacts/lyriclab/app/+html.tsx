import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

const prelaunchValue = process.env.EXPO_PUBLIC_PRELAUNCH_MODE?.trim().toLowerCase();
const prelaunchEnabled =
  prelaunchValue === "true" ||
  prelaunchValue === "1" ||
  prelaunchValue === "on";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        {prelaunchEnabled ? (
          <meta name="robots" content="noindex, nofollow, noarchive" />
        ) : null}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}