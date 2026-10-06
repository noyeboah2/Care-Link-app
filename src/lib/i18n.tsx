'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { TWI, TWI_REVIEWED } from '@/lib/twi';

export type Lang = 'en' | 'tw';
const STORAGE_KEY = 'cl_lang';

// English text is the key. Missing Twi text falls back to English, so nothing ever shows blank.
// {word} placeholders are replaced from `vars`.
export function translate(lang: Lang, text: string, vars?: Record<string, string | number>): string {
  let out = lang === 'tw' ? TWI[text] ?? text : text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return out;
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (text: string, vars?: Record<string, string | number>) => string;
  draft: boolean; // Twi is shown but has not been reviewed yet
}

const defaultCtx: Ctx = { lang: 'en', setLang: () => undefined, t: (text, vars) => translate('en', text, vars), draft: false };
const I18nContext = createContext<Ctx>(defaultCtx);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  // Read the saved choice after the page loads (the first paint is a spinner, so nothing flashes).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'tw' || saved === 'en') setLangState(saved);
    } catch {
      /* storage unavailable: stay on English */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'tw' ? 'ak' : 'en'; // ak = Akan (Twi)
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t: (text, vars) => translate(lang, text, vars), draft: lang === 'tw' && !TWI_REVIEWED }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

// "English | Twi" toggle. Language names are always written in their own language.
export function LanguageSwitch({ className = '', dark = false }: { className?: string; dark?: boolean }) {
  const { lang, setLang } = useI18n();
  const base = 'px-2.5 py-1 text-xs font-bold transition';
  const on = dark ? 'bg-white text-emerald-800' : 'bg-slate-900 text-white';
  const off = dark ? 'text-emerald-100 hover:bg-emerald-600' : 'text-slate-600 hover:bg-slate-100';
  return (
    <div role="group" aria-label="Language / Kasa" className={`inline-flex rounded-lg overflow-hidden border ${dark ? 'border-emerald-300/50' : 'border-slate-300'} ${className}`}>
      {([['en', 'English'], ['tw', 'Twi']] as const).map(([code, label]) => (
        <button key={code} type="button" onClick={() => setLang(code)} aria-pressed={lang === code} className={`${base} ${lang === code ? on : off}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
