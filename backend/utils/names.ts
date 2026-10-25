const PARTS = 4;
const HAS_LETTER = /\p{L}/u;

type NameResult = { name: string; error?: never } | { error: string; name?: never };

export function fourPartName(raw: string | undefined | null, who = "the owner's"): NameResult {
  const parts = String(raw || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < PARTS || !parts.every((p) => HAS_LETTER.test(p))) {
    return {
      error: `Enter ${who} four names as on their national ID or passport: first name, middle name, second middle name and surname`,
    };
  }
  return { name: parts.join(' ') };
}
