export const PRIVACY_POLICY_TITLE = "LyricLab Privacy Policy";
export const PRIVACY_POLICY_LAST_UPDATED = "September 23, 2026";

export const PRIVACY_POLICY_SECTIONS = [
  {
    heading: "What we collect",
    body:
      "When you create an account, we collect your email address, username, account identifier, and the class you choose. We store your LyricLab sessions, scores, streak-related progress, leaderboard progress, and battle verses so the app can show your history and progress. Guests can play without an account; guest progress stays on that device.",
  },
  {
    heading: "Why we use it",
    body:
      "We use this information to provide LyricLab, keep you signed in, save your progress, show your profile and leaderboard position, prevent abuse, and improve reliability. We do not sell your personal information.",
  },
  {
    heading: "AI scoring and opponent verses",
    body:
      "When you submit lyrics for scoring, or ask for an opponent verse or battle result, the relevant lyrics and prompt information are processed by our AI providers to return the requested feedback or verse. Do not submit information that you do not want processed for this purpose. LyricLab does not use your lyrics to identify you or sell them.",
  },
  {
    heading: "Service providers",
    body:
      "LyricLab uses Supabase for account authentication and app data storage. We use AI providers to process lyrics and generate scoring feedback or opponent content. These providers process information only as needed to provide their services to LyricLab and are expected to protect it under their own terms and privacy practices.",
  },
  {
    heading: "How long we keep data",
    body:
      "We keep account and app data while your account is active. When you delete your account in the app, we delete the app-owned account data and then delete the Supabase authentication account. Guest data remains on your device until you reset local data or remove the app.",
  },
  {
    heading: "How to delete your data",
    body:
      "Signed-in users can open Profile, choose the Account section, and select Delete account. The action requires confirmation and permanently deletes the account, username, written lyrics stored by LyricLab, battle history, scores, and streak-related progress. This cannot be recovered. Guests can use Reset local data in the same section to remove their on-device progress.",
  },
  {
    heading: "Children",
    body:
      "LyricLab is not intended for children under 13. Do not create an account or use the service if you are under 13.",
  },
  {
    heading: "Contact",
    body:
      "Questions about privacy or a deletion request can be sent to privacy@lyriclab.app. This address is replaceable by the LyricLab operator before launch if a different support address is used.",
  },
] as const;

export const PRIVACY_POLICY_TEXT = [
  PRIVACY_POLICY_TITLE,
  `Last updated: ${PRIVACY_POLICY_LAST_UPDATED}`,
  "",
  ...PRIVACY_POLICY_SECTIONS.flatMap(({ heading, body }) => [heading, body, ""]),
].join("\n");