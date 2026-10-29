/**
 * Verified business facts. Every value here is sourced in RESEARCH.md — do not add anything
 * that is not verified there (no prices, certifications, warranties or delivery terms).
 */
export const business = {
  name: 'NEW DEC',
  nameHy: 'ՆՅՈՒ ԴԵԿ',
  tagline: 'Ձեր երազանքների ինտերիերը կդառնա իրականություն NewDec-ի հետ միասին',
  phoneDisplay: '+374 44 30 53 55',
  phoneE164: '+37444305355',
  address: {
    street: 'Հրաչյա Քոչար 1',
    city: 'Երևան',
    district: 'Արաբկիր',
    postalCode: '0033',
    country: 'AM',
    landmark: '«Բարեկամություն» մետրոյի կայարանի մոտ',
    streetLatin: 'Hrachya Kochar St 1',
  },
  geo: { lat: 40.198211, lng: 44.493516 },
  hours: [
    { days: 'Երկուշաբթի – ուրբաթ', short: 'Երկ.–Ուրբ.', open: '11:00', close: '19:00', schema: 'Mo-Fr 11:00-19:00' },
    { days: 'Շաբաթ', short: 'Շաբ.', open: '11:00', close: '18:00', schema: 'Sa 11:00-18:00' },
  ],
  social: {
    instagram: 'https://www.instagram.com/newdec_yvn/',
    tiktok: 'https://www.tiktok.com/@newdec_yvn',
  },
  maps: {
    google: 'https://www.google.com/maps/search/?api=1&query=40.198211%2C44.493516',
    yandex: 'https://yandex.com/maps/org/nyu_dek/40966764644/',
    directions: 'https://www.google.com/maps/dir/?api=1&destination=40.198211%2C44.493516',
  },
} as const;

export type Business = typeof business;
