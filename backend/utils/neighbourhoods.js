// Juba neighbourhoods for the parcel forms. Sources: MapAction Juba City Map
// (2014, OpenStreetMap) and UN-Habitat / World Vision reports.

const CITY = 'Juba';

const NEIGHBOURHOODS = [
  'Amarat',
  'Atlabara A',
  'Atlabara B',
  'Atlabara C',
  'Buluk',
  'Cinema',
  'Commercial',
  'Gabat',
  'Gezira',
  'Gonya',
  'Gudele',
  'Gudele Block 9',
  'Gudele West',
  'Gumbo',
  'Gurei',
  'Jalaba',
  'Jebel',
  'Jebel Kujur',
  'Jerusalem',
  'Juba na Bari',
  'Juba Town',
  'Kator',
  'Kator West',
  'Konyo Konyo',
  'Kosti',
  'Kuwait',
  'Kworjik',
  'Lologo',
  'Malakal',
  'Malakia',
  'Mangateen',
  'Mauna',
  'Mia Saba',
  'Mudiria',
  'Munuki',
  'Muozifin',
  'Negli',
  'Neem',
  'Nimra Talata',
  'Nyakama',
  'Nyakuron',
  'Nyakuron Extension',
  'Referendum',
  'Rock City',
  'Souk Hajar',
  'Thoura',
  'Tongping',
  'Zandia',
];

// "hai munuki " → the list's spelling ("Munuki"); anything not on the list is
// kept as typed (trimmed), so "Other" still works.
function canonicalNeighbourhood(name) {
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ').replace(/^hai\s+/i, '');
  const match = NEIGHBOURHOODS.find((n) => n.toLowerCase() === cleaned.toLowerCase());
  return match || cleaned;
}

module.exports = { CITY, NEIGHBOURHOODS, canonicalNeighbourhood };
