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

function normalizeUsername(value: string): string {
  return value
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
}

export function containsBlockedTerm(value: string): boolean {
  const normalized = value.toLowerCase().trim();
  return LONG_BLOCKED_TERMS.some((term) => normalized.includes(term)) ||
    SHORT_BLOCKED_TERMS.some((term) => normalized.includes(term));
}

export function validateUsername(value: string): string | null {
  const username = normalizeUsername(value);
  const message = "That username isn't allowed. Try another one.";
  if (username.length < 3 || username.length > 20) return message;
  if (!/^[a-z0-9_.]+$/.test(username)) return message;
  if (RESERVED_USERNAMES.has(username)) return message;
  if (LONG_BLOCKED_TERMS.some((term) => username.includes(term))) return message;
  const segments = username.split(/[_.\d]+/).filter(Boolean);
  if (SHORT_BLOCKED_TERMS.some((term) => segments.includes(term))) return message;
  return null;
}