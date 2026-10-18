/*
 * Two UI languages, French and English. Strings are written in place as `tr('Français', 'English')`
 * so both versions stay side by side in the code. The locale is detected once at load (webview:
 * `<html lang>` set by the host; extension host: VS Code's NLS config; CLI: the system locale) and
 * can be forced with `setLocale`.
 */

export type Locale = 'fr' | 'en';

const norm = (l: string | undefined | null): Locale | null => (!l ? null : l.toLowerCase().startsWith('fr') ? 'fr' : 'en');

function detect(): Locale {
  const g = globalThis as { document?: { documentElement?: { lang?: string } }; process?: { env?: Record<string, string | undefined> } };
  const html = norm(g.document?.documentElement?.lang);
  if (html) return html;
  const nls = g.process?.env?.VSCODE_NLS_CONFIG;
  if (nls) {
    try {
      const l = norm((JSON.parse(nls) as { locale?: string }).locale);
      if (l) return l;
    } catch {
      /* malformed: fall through */
    }
  }
  const env = g.process?.env;
  return norm(env?.LC_ALL || env?.LANG) ?? norm(Intl.DateTimeFormat().resolvedOptions().locale) ?? 'en';
}

let locale: Locale = detect();

export const setLocale = (l: string): Locale => (locale = norm(l) ?? 'en');
export const getLocale = (): Locale => locale;

/** The string of the current locale. */
export const tr = (fr: string, en: string): string => (locale === 'fr' ? fr : en);

/** Number formatting of the current locale. */
export const fmtNumber = (n: number, digits = 4): string => n.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: digits });
