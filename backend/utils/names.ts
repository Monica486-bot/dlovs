// Owner names are partly hidden from the public, so a list of someone's land can't be read off DLOVS:
// "Nyandeng Kuol Ajak Mayen" becomes "Nyandeng K***".
export function maskName(name: string | null | undefined): string | null {
  if (!name) return null;
  const [first, second] = name.trim().split(/\s+/);
  return second ? `${first} ${second[0]}***` : `${first[0]}***`;
}

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
