const PARTS = 4;
const HAS_LETTER = /\p{L}/u;

// Owner names need four parts, as on South Sudanese IDs and passports.
// { name } with spacing tidied, or { error }
function fourPartName(raw, who = "the owner's") {
  const parts = String(raw || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < PARTS || !parts.every((p) => HAS_LETTER.test(p))) {
    return {
      error: `Enter ${who} four names as on their national ID or passport: first name, middle name, second middle name and surname`,
    };
  }
  return { name: parts.join(' ') };
}

module.exports = { fourPartName };
