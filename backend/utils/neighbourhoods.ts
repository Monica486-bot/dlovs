export const CITY = 'Juba';

export const NEIGHBOURHOODS: string[] = [
  'Amarat', 'Atlabara A', 'Atlabara B', 'Atlabara C', 'Buluk', 'Cinema',
  'Commercial', 'Gabat', 'Gezira', 'Gonya', 'Gudele', 'Gudele Block 9',
  'Gudele West', 'Gumbo', 'Gurei', 'Jalaba', 'Jebel', 'Jebel Kujur',
  'Jerusalem', 'Juba na Bari', 'Juba Town', 'Kator', 'Kator West',
  'Konyo Konyo', 'Kosti', 'Kuwait', 'Kworjik', 'Lologo', 'Malakal',
  'Malakia', 'Mangateen', 'Mauna', 'Mia Saba', 'Mudiria', 'Munuki',
  'Muozifin', 'Negli', 'Neem', 'Nimra Talata', 'Nyakama', 'Nyakuron',
  'Nyakuron Extension', 'Referendum', 'Rock City', 'Souk Hajar', 'Thoura',
  'Tongping', 'Zandia',
];

export function canonicalNeighbourhood(name: string | undefined | null): string {
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ').replace(/^hai\s+/i, '');
  const match = NEIGHBOURHOODS.find((n) => n.toLowerCase() === cleaned.toLowerCase());
  return match || cleaned;
}
