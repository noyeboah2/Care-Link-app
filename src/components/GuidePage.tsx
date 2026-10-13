'use client';

import React, { useState } from 'react';
import { AlertTriangle, Dna, Info, Pill, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { GUIDE_DISCLAIMER, GUIDE_DRAFT_NOTICE, GUIDE_INTRO, GUIDE_REVIEWED, GUIDE_SECTIONS, GUIDE_TITLE } from '@/lib/guide';
import { CHART, GENOTYPES, MEANING, VERDICT_LABEL, chartRowFor, outcomes, percentFor, type Genotype, type Verdict } from '@/lib/genotypes';

const SECTION_STYLE = {
  triggers: { Icon: AlertTriangle, tone: 'text-amber-600 bg-amber-50' },
  medications: { Icon: Pill, tone: 'text-brand bg-blue-50' },
  prevention: { Icon: ShieldCheck, tone: 'text-emerald-700 bg-emerald-50' },
} as const;

const VERDICT_STYLE: Record<Verdict, string> = {
  OKAY: 'bg-emerald-100 text-emerald-800',
  ONLY_SS: 'bg-amber-100 text-amber-800',
  ONLY_CC: 'bg-amber-100 text-amber-800',
  NOT_ADVISABLE: 'bg-red-100 text-red-700',
};

const POSSIBLE_PAIRINGS = (GENOTYPES.length * (GENOTYPES.length + 1)) / 2; // 21

const selectCls =
  'mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-semibold bg-white focus:ring-2 focus:ring-brand focus:outline-none';

// The reference guide and the genotype compatibility chart.
export const GuidePage: React.FC = () => {
  const { t } = useI18n();
  const [p1, setP1] = useState<Genotype | ''>('');
  const [p2, setP2] = useState<Genotype | ''>('');

  const both = p1 !== '' && p2 !== '';
  const row = both ? chartRowFor(p1 as Genotype, p2 as Genotype) : null;
  const kids = both ? outcomes(p1 as Genotype, p2 as Genotype) : [];

  return (
    <div className="w-full max-w-7xl space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-black text-brand">{t(GUIDE_TITLE)}</h2>
        <p className="mt-2 text-sm sm:text-base text-slate-700 leading-relaxed max-w-4xl">{t(GUIDE_INTRO)}</p>
      </div>

      {!GUIDE_REVIEWED && (
        <div role="note" className="flex items-start space-x-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{t(GUIDE_DRAFT_NOTICE)}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {GUIDE_SECTIONS.map((section) => {
          const { Icon, tone } = SECTION_STYLE[section.id];
          return (
            <section key={section.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
                <span className={`p-2 rounded-lg ${tone}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <h3 className="font-black text-slate-900">{t(section.title)}</h3>
              </div>
              <ul className="mt-3 space-y-3">
                {section.items.map((item) => (
                  <li key={item.title} className="text-sm">
                    <p className="font-bold text-slate-900">{t(item.title)}</p>
                    <p className="text-slate-600 leading-relaxed">{t(item.text)}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        {/* The chart, as supplied */}
        <section className="xl:col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-brand text-white text-center px-4 py-3">
            <h3 className="font-black text-lg">{t('Sickling Genotype Compatibility Chart')}</h3>
            <p className="text-sm font-semibold text-white/90">{t('Are You Compatible?')}</p>
          </div>
          <table className="w-full text-left">
            <caption className="sr-only">{t('Sickling Genotype Compatibility Chart')}</caption>
            <thead>
              <tr className="bg-blue-50 text-brand text-sm font-black">
                <th scope="col" className="px-4 py-3 text-center w-1/5">{t('Partner 1')}</th>
                <th scope="col" className="px-4 py-3 text-center w-1/5">{t('Partner 2')}</th>
                <th scope="col" className="px-4 py-3">{t('Compatibility')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CHART.map((r) => {
                const selected = both && row === r;
                return (
                  <tr key={`${r.a}-${r.b}`} aria-selected={selected || undefined} className={selected ? 'bg-blue-50 ring-2 ring-inset ring-brand' : ''}>
                    <td className="px-4 py-2.5 text-center font-black tracking-wide text-slate-900">{r.a}</td>
                    <td className="px-4 py-2.5 text-center font-black tracking-wide text-slate-900">{r.b}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs sm:text-sm font-bold ${VERDICT_STYLE[r.verdict]}`}>{t(VERDICT_LABEL[r.verdict])}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-slate-500 border-t border-slate-100">
            {t('The chart lists {n} of the {total} possible pairings. Pairings that are not listed need advice from a doctor.', { n: CHART.length, total: POSSIBLE_PAIRINGS })}
          </p>
        </section>

        <div className="xl:col-span-2 space-y-4">
          {/* Check a couple */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center space-x-3">
              <span className="p-2 rounded-lg text-brand bg-blue-50">
                <Dna className="w-5 h-5" />
              </span>
              <h3 className="font-black text-slate-900">{t('Check a couple')}</h3>
            </div>
            <p className="text-sm text-slate-600">{t('Choose each partner’s genotype to see what the chart says and what children could inherit.')}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="geno-1" className="text-xs font-bold text-slate-600">{t('Partner 1 genotype')}</label>
                <select id="geno-1" value={p1} onChange={(e) => setP1(e.target.value as Genotype | '')} className={selectCls}>
                  <option value="">{t('Choose...')}</option>
                  {GENOTYPES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="geno-2" className="text-xs font-bold text-slate-600">{t('Partner 2 genotype')}</label>
                <select id="geno-2" value={p2} onChange={(e) => setP2(e.target.value as Genotype | '')} className={selectCls}>
                  <option value="">{t('Choose...')}</option>
                  {GENOTYPES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            {both && (
              <div className="space-y-3" aria-live="polite">
                {row ? (
                  <div className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2.5">
                    <span className="text-sm font-bold text-slate-700">{t('From the chart')}: {p1} + {p2}</span>
                    <span className={`px-2.5 py-1 rounded-full text-xs sm:text-sm font-bold ${VERDICT_STYLE[row.verdict]}`}>{t(VERDICT_LABEL[row.verdict])}</span>
                  </div>
                ) : (
                  <div className="flex items-start space-x-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2.5 text-sm font-semibold">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{t('This pairing is not in the chart. Please ask a doctor or genetic counsellor.')}</span>
                  </div>
                )}

                <div>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-wide mb-2">{t('Chances for each child')}</p>
                  <ul className="space-y-1.5">
                    {kids.map((o) => (
                      <li key={o.genotype} className="flex items-center gap-3 text-sm">
                        <span className="w-12 text-right font-black text-slate-900">{o.percent}%</span>
                        <span className="w-9 font-black text-brand">{o.genotype}</span>
                        <span className="text-slate-600">{t(MEANING[o.genotype])}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 space-y-1">
                  <p className="font-bold text-slate-800">{t('Chance of sickle cell disease (SS or SC): {n}%', { n: percentFor(kids, ['SS', 'SC']) })}</p>
                  <p className="font-bold text-slate-800">{t('Chance of hemoglobin C disease (CC): {n}%', { n: percentFor(kids, ['CC']) })}</p>
                  <p className="text-xs text-slate-500">{t('The same chances apply to every pregnancy.')}</p>
                </div>
              </div>
            )}
          </section>

          {/* What the letters mean */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-black text-slate-900">{t('What the letters mean')}</h3>
            <p className="mt-1 text-sm text-slate-600">{t('A is the normal gene, S is the sickle gene and C is the hemoglobin C gene. Each person has two letters, one from each parent.')}</p>
            <ul className="mt-3 space-y-1.5">
              {GENOTYPES.map((g) => (
                <li key={g} className="flex items-baseline gap-3 text-sm">
                  <span className="w-9 font-black text-brand">{g}</span>
                  <span className="text-slate-700">{t(MEANING[g])}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <p className="text-xs text-slate-500 pb-2">{t(GUIDE_DISCLAIMER)}</p>
    </div>
  );
};
