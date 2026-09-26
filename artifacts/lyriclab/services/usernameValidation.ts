const LONG_BLOCKED_TERMS = [
  "nigger", "nigga", "faggot", "retard", "tranny", "wetback", "blowjob", "handjob",
];
const SHORT_BLOCKED_TERMS = [
  "cum", "anal", "dick", "cock", "spic", "fag", "gook", "kike", "chink", "cunt",
  "penis", "rape", "jizz", "dildo", "pussy", "vagina",
];
const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "moderator", "mod", "lyriclab", "lyric_lab",
  "support", "official", "staff", "system",
]);

export const USERNAME_ERROR = "That username isn't allowed. Try another one.";

export function validateUsername(value: string): string | null {
  const username = value
    .trim()
    .toLowerCase()
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/0/g, "o")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
  if (username.length < 3 || username.length > 20) return USERNAME_ERROR;
  if (!/^[a-z0-9_.]+$/.test(username)) return USERNAME_ERROR;
  if (RESERVED_USERNAMES.has(username)) return USERNAME_ERROR;
  if (LONG_BLOCKED_TERMS.some((term) => username.includes(term))) return USERNAME_ERROR;
  const segments = username.split(/[_.\d]+/).filter(Boolean);
  return SHORT_BLOCKED_TERMS.some((term) => segments.includes(term)) ? USERNAME_ERROR : null;
}