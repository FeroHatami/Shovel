// Tiny i18n layer: German is the source language, English is given inline at the call site: t('Befunde', 'Findings').
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CAT, DEC, SEV, SRC, setApiLang, type Decision } from './api.ts';

export type Lang = 'de' | 'en';
const KEY = 'shovel-lang';

// Settings used to be stored under the prefix "va-". Move them once to "shovel-" so the
// language choice, decisions and edited questions survive the rename.
try {
  const old: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('va-')) old.push(k);
  }
  for (const k of old) {
    const v = localStorage.getItem(k);
    const nk = 'shovel-' + k.slice(3);
    if (v != null && localStorage.getItem(nk) == null) localStorage.setItem(nk, v);
    localStorage.removeItem(k);
  }
} catch {}

// The stored choice wins; without one: German for German browsers, English for everyone else.
const readLang = (): Lang => {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'en' || stored === 'de') return stored;
  } catch {}
  try {
    return (navigator.language || '').toLowerCase().startsWith('de') ? 'de' : 'en';
  } catch {
    return 'en';
  }
};

// ---- label maps -------------------------------------------------------------------------------
const CAT_EN: Record<string, string> = { fehler: 'Error', unklar: 'Unclear description', widerspruch: 'Contradiction', luecke: 'Missing item', menge: 'Quantity', preis: 'Price', vertrag: 'Contract risk', schnittstelle: 'Interface', bieter: 'Bidder input' };
const SEV_EN = ['', 'Low', 'Medium', 'High'];
const SRC_EN: Record<string, string> = { regel: 'Rule', statistik: 'Statistics', ki: 'AI' };
const DEC_EN: Record<Decision, string> = { bieterfrage: 'Ask the client', zuschlag: 'Price in', chance: 'Keep as change-order chance', ok: 'Noted', verworfen: 'Dismiss' };
const DRIVER_EN: Record<string, string> = { stahl: 'Steel / reinforcement', beton: 'Concrete / cement / masonry', bitumen: 'Asphalt / bitumen', diesel: 'Diesel / transport', kunststoff: 'Plastics / insulation', lohn: 'Labour' };

export const catLabels = (lang: Lang): Record<string, string> => (lang === 'en' ? CAT_EN : CAT);
export const sevLabels = (lang: Lang): string[] => (lang === 'en' ? SEV_EN : SEV);
export const srcLabels = (lang: Lang): Record<string, string> => (lang === 'en' ? SRC_EN : SRC);
export const decLabels = (lang: Lang): Record<Decision, string> => (lang === 'en' ? DEC_EN : DEC);
/** Cost-driver label for the what-if tab; `fallback` is the German label from the core. */
export const driverLabel = (lang: Lang, key: string, fallback: string): string => (lang === 'en' ? DRIVER_EN[key] || fallback : fallback);
/** Language-aware plural: "1 Befund" / "3 Befunde" / "1 finding" / "3 findings". */
export const pluralL = (lang: Lang, n: number, deOne: string, deMany: string, enOne: string, enMany: string): string =>
  lang === 'en' ? `${n} ${n === 1 ? enOne : enMany}` : `${n} ${n === 1 ? deOne : deMany}`;

// ---- context ----------------------------------------------------------------------------------
export interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Returns the German or the English string, depending on the current language. */
  t: (de: string, en: string) => string;
  /** Plural helper bound to the current language. */
  pl: (n: number, deOne: string, deMany: string, enOne: string, enMany: string) => string;
  cat: (key: string) => string;
  sev: (n: number) => string;
  src: (key: string) => string;
  dec: (d: Decision) => string;
  driver: (key: string, fallback: string) => string;
}

const make = (lang: Lang, setLang: (l: Lang) => void): I18n => ({
  lang,
  setLang,
  t: (de, en) => (lang === 'en' ? en : de),
  pl: (n, deOne, deMany, enOne, enMany) => pluralL(lang, n, deOne, deMany, enOne, enMany),
  cat: (key) => catLabels(lang)[key] || key,
  sev: (n) => sevLabels(lang)[n] || '',
  src: (key) => srcLabels(lang)[key] || key,
  dec: (d) => decLabels(lang)[d] || d,
  driver: (key, fallback) => driverLabel(lang, key, fallback),
});

const Ctx = createContext<I18n>(make('de', () => {}));

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const l = readLang();
    setApiLang(l); // before the first request goes out
    return l;
  });
  const setLang = useCallback((l: Lang) => {
    setApiLang(l);
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = lang === 'en' ? 'Shovel – bill of quantities check' : 'Shovel – LV-Gegenprüfung';
  }, [lang]);
  const value = useMemo(() => make(lang, setLang), [lang, setLang]);
  return createElement(Ctx.Provider, { value }, children);
}

export const useT = (): I18n => useContext(Ctx);
