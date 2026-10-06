// Marks an English message that is stored first and translated later, when it is shown
// (for example an error saved in state). It returns the text unchanged; the translation
// checker uses it to find every string that needs a Twi version.
export const msg = (text: string): string => text;

export const RISK_LABEL: Record<string, string> = {
  HIGH_RISK: msg('HIGH RISK'),
  LOW_RISK: msg('LOW RISK'),
  PENDING: msg('NOT SCREENED'),
};
