// Single source of truth for screening questions and risk scoring.
// Used by the wizard (instant result) and the API (value that gets stored).
// NOTE: weights and threshold must be reviewed and approved by a clinician.

import { msg } from '@/lib/msg';

export interface Question {
  id: string;
  text: string;
  subtext: string;
  weight: number;
}

export const SCREENING_QUESTIONS: Question[] = [
  { id: 'jaundice', text: msg('Does the child show yellowing in the eyes or skin (Jaundice)?'), subtext: msg('Look closely at the sclera in daylight.'), weight: 3 },
  { id: 'severePain', text: msg('Has the child experienced severe, unexplained bone or joint pain?'), subtext: msg('Episodes lasting hours or days.'), weight: 4 },
  { id: 'dactylitis', text: msg('Is there painful swelling of the hands or feet (Dactylitis)?'), subtext: msg('Common early symptom in infants under 2 years.'), weight: 4 },
  { id: 'fatigue', text: msg('Does the child experience extreme tiredness or pale skin/lips?'), subtext: msg('Signs of severe anemia.'), weight: 2 },
  { id: 'fever', text: msg('Does the child currently have a high fever (≥38.5°C)?'), subtext: msg('Infection risk is critically elevated in SCD.'), weight: 3 },
];

export const HIGH_RISK_THRESHOLD = 5;

export type RiskLevel = 'HIGH_RISK' | 'LOW_RISK';

export function scoreAnswers(answers: Record<string, boolean>): { score: number; riskLevel: RiskLevel } {
  let score = 0;
  for (const q of SCREENING_QUESTIONS) {
    if (answers[q.id] === true) score += q.weight;
  }
  return { score, riskLevel: score >= HIGH_RISK_THRESHOLD ? 'HIGH_RISK' : 'LOW_RISK' };
}
