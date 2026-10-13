import { msg } from '@/lib/msg';

// Set to true only after a doctor has checked the guide. Until then a notice is shown on the page.
export const GUIDE_REVIEWED = false;

export const GUIDE_TITLE = msg('Sickle Cell Disease: Reference Guide');
export const GUIDE_INTRO = msg(
  'Sickle cell disease is an inherited blood disorder where abnormal hemoglobin causes flexible, round red blood cells to become rigid and crescent-shaped. These stiff cells clump together and block small blood vessels, cutting off oxygen flow and causing severe pain and tissue damage.',
);
export const GUIDE_DISCLAIMER = msg('This is for informational purposes only. For medical advice or diagnosis, consult a professional.');
export const GUIDE_DRAFT_NOTICE = msg('This guide has not been checked by a doctor yet. Use it for information only; it does not replace medical advice.');

export interface GuideSection {
  id: 'triggers' | 'medications' | 'prevention';
  title: string;
  items: Array<{ title: string; text: string }>;
}

// Wording follows the supplied reference document.
export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'triggers',
    title: msg('Common Triggers'),
    items: [
      { title: msg('Dehydration'), text: msg('Low fluid levels make the blood thicker and easier to sickle.') },
      { title: msg('Infections and Illness'), text: msg('Fevers and fighting sickness cause inflammation that triggers cells to stick together.') },
      { title: msg('Extreme Temperatures'), text: msg('Very cold or very hot weather, or sudden temperature shifts, can affect blood flow.') },
      { title: msg('Physical Stress or Exertion'), text: msg('Overworking the body, heavy lifting, or intense exercise.') },
      { title: msg('Emotional Stress and Exhaustion'), text: msg('High levels of emotional pressure, anxiety, or lack of sleep.') },
      { title: msg('High Altitudes'), text: msg('Low oxygen levels in high-altitude environments.') },
    ],
  },
  {
    id: 'medications',
    title: msg('Medications'),
    items: [
      { title: msg('Hydroxyurea'), text: msg('A core disease-modifying medication that increases fetal hemoglobin to reduce the frequency of painful crises.') },
      { title: msg('Pain Relievers'), text: msg('Over-the-counter options like ibuprofen or acetaminophen for mild pain, or prescribed pain medications for severe crises.') },
      { title: msg('Targeted Therapies'), text: msg('FDA-approved drugs such as L-glutamine or crizanlizumab to help prevent cell clumping and blood vessel blockages.') },
      { title: msg('Antibiotics and Vaccinations'), text: msg('Preventative treatments (such as daily penicillin for young children) to ward off dangerous infections.') },
    ],
  },
  {
    id: 'prevention',
    title: msg('Ways to Prevent a Crisis'),
    items: [
      { title: msg('Drink Plenty of Fluids'), text: msg('Stay well-hydrated by drinking water regularly throughout the day.') },
      { title: msg('Dress for the Weather'), text: msg('Avoid cold exposure, wear warm layers, and stay cool in hot weather.') },
      { title: msg('Prevent Infections'), text: msg('Wash your hands often, stay up to date on recommended vaccinations, and avoid sick individuals.') },
      { title: msg('Manage Stress and Rest'), text: msg('Get enough sleep and practice healthy ways to handle emotional stress.') },
      { title: msg('Avoid Triggers'), text: msg('Stay away from high altitudes, heavy overexertion, smoking, and excessive alcohol.') },
    ],
  },
];
