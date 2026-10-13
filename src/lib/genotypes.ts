import { msg } from '@/lib/msg';

// Hemoglobin genotypes used in the compatibility chart.
// A = normal gene, S = sickle gene, C = hemoglobin C gene. Everyone has two letters, one from each parent.
export const GENOTYPES = ['AA', 'AS', 'AC', 'SS', 'SC', 'CC'] as const;
export type Genotype = (typeof GENOTYPES)[number];

export type Verdict = 'OKAY' | 'ONLY_SS' | 'ONLY_CC' | 'NOT_ADVISABLE';

export const VERDICT_LABEL: Record<Verdict, string> = {
  OKAY: msg('Okay'),
  ONLY_SS: msg('Only option for SS'),
  ONLY_CC: msg('Only option for CC'),
  NOT_ADVISABLE: msg('Not advisable'),
};

// The "Sickling Genotype Compatibility Chart", exactly as supplied (13 pairings, in the same order).
// Pairings that are not listed here are NOT in the chart; the app says so and never makes up a verdict.
export const CHART: Array<{ a: Genotype; b: Genotype; verdict: Verdict }> = [
  { a: 'AA', b: 'AA', verdict: 'OKAY' },
  { a: 'AA', b: 'AS', verdict: 'OKAY' },
  { a: 'AA', b: 'AC', verdict: 'OKAY' },
  { a: 'AA', b: 'SS', verdict: 'ONLY_SS' },
  { a: 'AA', b: 'CC', verdict: 'ONLY_CC' },
  { a: 'AC', b: 'AC', verdict: 'NOT_ADVISABLE' },
  { a: 'AC', b: 'CC', verdict: 'NOT_ADVISABLE' },
  { a: 'AS', b: 'AC', verdict: 'NOT_ADVISABLE' },
  { a: 'AS', b: 'AS', verdict: 'NOT_ADVISABLE' },
  { a: 'AS', b: 'SS', verdict: 'NOT_ADVISABLE' },
  { a: 'CC', b: 'CC', verdict: 'NOT_ADVISABLE' },
  { a: 'SC', b: 'SC', verdict: 'NOT_ADVISABLE' },
  { a: 'SS', b: 'SS', verdict: 'NOT_ADVISABLE' },
];

// Order does not matter: "AS + AC" is the same pairing as "AC + AS".
export const chartRowFor = (a: Genotype, b: Genotype) =>
  CHART.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)) ?? null;

export const MEANING: Record<Genotype, string> = {
  AA: msg('No sickle or C gene'),
  AS: msg('Sickle cell trait (carrier)'),
  AC: msg('Hemoglobin C trait (carrier)'),
  SS: msg('Sickle cell disease'),
  SC: msg('Sickle-hemoglobin C disease'),
  CC: msg('Hemoglobin C disease'),
};

const ALLELES: Record<Genotype, [string, string]> = {
  AA: ['A', 'A'], AS: ['A', 'S'], AC: ['A', 'C'], SS: ['S', 'S'], SC: ['S', 'C'], CC: ['C', 'C'],
};
const ORDER = ['A', 'S', 'C'];
const nameOf = (x: string, y: string) => ([x, y].sort((p, q) => ORDER.indexOf(p) - ORDER.indexOf(q)).join('') as Genotype);

// What each child can inherit: every child gets one letter from each parent, chosen by chance.
// The four combinations are equally likely, so each is 25%. The same chances apply to every pregnancy.
export function outcomes(a: Genotype, b: Genotype): Array<{ genotype: Genotype; percent: number }> {
  const counts = new Map<Genotype, number>();
  for (const x of ALLELES[a]) for (const y of ALLELES[b]) counts.set(nameOf(x, y), (counts.get(nameOf(x, y)) ?? 0) + 1);
  return GENOTYPES.filter((g) => counts.has(g)).map((g) => ({ genotype: g, percent: (counts.get(g) as number) * 25 }));
}

export const percentFor = (list: ReturnType<typeof outcomes>, genotypes: Genotype[]) =>
  list.filter((o) => genotypes.includes(o.genotype)).reduce((sum, o) => sum + o.percent, 0);
