// Owners are registered with four names, as on South Sudanese national IDs
// and passports. The form keeps the four parts as an array.
export const EMPTY_NAMES = ['', '', '', ''];

export function joinNames(parts) {
  return parts.map((p) => p.trim()).filter(Boolean).join(' ');
}

// "Akoi Deng Majok Garang" → four parts; any extra words go in the last one
export function splitNames(full) {
  const words = String(full || '').trim().split(/\s+/).filter(Boolean);
  return [words[0] || '', words[1] || '', words[2] || '', words.slice(3).join(' ')];
}
