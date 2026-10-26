export const EMPTY_NAMES: string[] = ['', '', '', ''];

export function joinNames(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(' ');
}

export function splitNames(full: string | null | undefined): string[] {
  const words = String(full || '').trim().split(/\s+/).filter(Boolean);
  return [words[0] || '', words[1] || '', words[2] || '', words.slice(3).join(' ')];
}
