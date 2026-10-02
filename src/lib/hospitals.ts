// Referral hospitals and the locations (areas) a child can live in.
// Names, locations and phone numbers come from the project's approved hospital list.
// Which hospital handles which level of care should be confirmed by a clinician.

export interface Hospital {
  id: string;
  name: string;
  area: string; // where the hospital is
  phones: string[]; // shown exactly as supplied
  specialist?: boolean; // dedicated sickle cell centre
  note?: string;
}

export const HOSPITALS: Hospital[] = [
  { id: 'kath', name: 'Komfo Anokye Teaching Hospital', area: 'Bantama, Kumasi', phones: ['+233 556 490 029'] },
  { id: 'kcscd', name: 'Kumasi Center for Sickle Cell Disease', area: 'KATH, Kumasi', phones: ['+233 32 220 01769'], specialist: true },
  { id: 'knust', name: 'KNUST University Hospital', area: 'KNUST, Kumasi', phones: ['+233 20 111 1055'] },
  { id: 'asokwa', name: 'Asokwa Children’s Hospital', area: 'Asokwa, Kumasi', phones: ['+233 35 229 4067'] },
  { id: 'kumasi-south', name: 'Kumasi South Hospital', area: 'Atonsu Agogo, Kumasi', phones: ['+233 32 202 9272'] },
  { id: 'suntreso', name: 'Suntreso Government Hospital', area: 'North Suntreso, Kumasi', phones: ['020 814 5717', '0244 447 220'] },
  { id: 'agogo', name: 'Presbyterian Hospital, Agogo', area: 'Agogo, Asante Akim North', phones: ['+233 32 249 5750'] },
  { id: 'ankaase', name: 'Methodist Hospital, Ankaase', area: 'Ankaase, Afigya Kwabre South', phones: ['+233 24 590 1995'] },
  { id: 'offinso', name: 'St. Patrick’s Hospital', area: 'Offinso', phones: ['+233 32 202 0337'] },
  { id: 'obuasi', name: 'AngloGold Ashanti Health Foundation Hospital', area: 'Obuasi', phones: ['0243 365 655'] },
];

export const hospitalById = (id: string) => HOSPITALS.find((h) => h.id === id) as Hospital;

// Where the child lives, and the hospital that serves that location first.
export interface Area {
  id: string;
  label: string;
  hospitalId: string;
}

export const AREAS: Area[] = [
  { id: 'bantama', label: 'Bantama, Kumasi', hospitalId: 'kath' },
  { id: 'knust', label: 'KNUST, Kumasi', hospitalId: 'knust' },
  { id: 'asokwa', label: 'Asokwa, Kumasi', hospitalId: 'asokwa' },
  { id: 'atonsu', label: 'Atonsu Agogo, Kumasi', hospitalId: 'kumasi-south' },
  { id: 'suntreso', label: 'North Suntreso, Kumasi', hospitalId: 'suntreso' },
  { id: 'agogo', label: 'Agogo, Asante Akim North', hospitalId: 'agogo' },
  { id: 'ankaase', label: 'Ankaase, Afigya Kwabre South', hospitalId: 'ankaase' },
  { id: 'offinso', label: 'Offinso', hospitalId: 'offinso' },
  { id: 'obuasi', label: 'Obuasi', hospitalId: 'obuasi' },
  { id: 'other-kumasi', label: 'Other area in Kumasi', hospitalId: 'kcscd' },
  { id: 'other', label: 'Other location', hospitalId: 'kcscd' },
];

export const AREA_IDS = AREAS.map((a) => a.id);
export const areaLabel = (id: string | null | undefined) => AREAS.find((a) => a.id === id)?.label ?? null;

export interface Referral {
  primary: Hospital;
  reason: string;
  alternatives: Hospital[];
}

// Hospital that serves the child's location first, plus two other options.
export function referralFor(areaId: string | null | undefined): Referral {
  const area = AREAS.find((a) => a.id === areaId);
  const primary = hospitalById(area ? area.hospitalId : 'kcscd');
  const reason = area && !area.id.startsWith('other')
    ? `Serves ${area.label}`
    : primary.specialist
    ? 'Dedicated sickle cell centre'
    : 'Recommended';
  const order = ['kcscd', 'kath', 'asokwa', 'knust'];
  const alternatives = order.filter((id) => id !== primary.id).slice(0, 2).map(hospitalById);
  return { primary, reason, alternatives };
}

// ---- helpers for calling and maps ----

// Returns a dialable +233 number, or null if the number is not a valid 9-digit Ghana number.
export function telHref(phone: string): string | null {
  const compact = phone.replace(/[\s-]/g, '');
  const local = compact.startsWith('+233') ? compact.slice(4) : compact.startsWith('0') ? compact.slice(1) : null;
  if (local === null || !/^\d{9}$/.test(local)) return null;
  return `tel:+233${local}`;
}

const mapsQuery = (h: Hospital) => `${h.name}, ${h.area}, Ghana`;
export const mapsEmbedUrl = (h: Hospital) => `https://www.google.com/maps?q=${encodeURIComponent(mapsQuery(h))}&output=embed`;
export const mapsOpenUrl = (h: Hospital) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery(h))}`;
export const mapsDirectionsUrl = (h: Hospital) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery(h))}`;
