import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, PhoneCall, ArrowLeft, HeartPulse, Building2 } from 'lucide-react';
import { TwiAudioPlayer } from './TwiAudioPlayer';

interface Question {
  id: string;
  text: string;
  subtext: string;
  weight: number;
}

const SCREENING_QUESTIONS: Question[] = [
  { id: 'jaundice', text: 'Does the child show yellowing in the eyes or skin (Jaundice)?', subtext: 'Look closely at the sclera in daylight.', weight: 3 },
  { id: 'severePain', text: 'Has the child experienced severe, unexplained bone or joint pain?', subtext: 'Episodes lasting hours or days.', weight: 4 },
  { id: 'dactylitis', text: 'Is there painful swelling of the hands or feet (Dactylitis)?', subtext: 'Common early symptom in infants under 2 years.', weight: 4 },
  { id: 'fatigue', text: 'Does the child experience extreme tiredness or pale skin/lips?', subtext: 'Signs of severe anemia.', weight: 2 },
  { id: 'fever', text: 'Does the child currently have a high fever (≥38.5°C)?', subtext: 'Infection risk is critically elevated in SCD.', weight: 3 },
];

export const ScdScreeningWizard: React.FC<{ childName: string; onComplete: () => void }> = ({ childName, onComplete }) => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<'HIGH_RISK' | 'LOW_RISK' | null>(null);

  const currentQ = SCREENING_QUESTIONS[step];
  const progressPercent = ((step + 1) / SCREENING_QUESTIONS.length) * 100;

  const handleAnswer = (val: boolean) => {
    const updated = { ...answers, [currentQ.id]: val };
    setAnswers(updated);

    if (step < SCREENING_QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      evaluateRisk(updated);
    }
  };

  const evaluateRisk = (finalAnswers: Record<string, boolean>) => {
    setIsSubmitting(true);
    let totalScore = 0;
    SCREENING_QUESTIONS.forEach((q) => {
      if (finalAnswers[q.id]) totalScore += q.weight;
    });

    setTimeout(() => {
      setIsSubmitting(false);
      setResult(totalScore >= 5 ? 'HIGH_RISK' : 'LOW_RISK');
    }, 600);
  };

  if (isSubmitting) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center p-6 space-y-4">
        <HeartPulse className="w-16 h-16 text-blue-900 animate-bounce" />
        <h3 className="text-lg font-bold text-slate-800">Processing Medical Engine Rules...</h3>
        <p className="text-sm text-slate-500">Evaluating clinical risk factors for {childName}</p>
      </div>
    );
  }

  if (result === 'HIGH_RISK') {
    return (
      <div className="p-4 max-w-md mx-auto space-y-5 animate-in fade-in duration-300">
        <div className="bg-red-600 text-white p-5 rounded-2xl shadow-lg border border-red-700 text-center space-y-2">
          <AlertTriangle className="w-12 h-12 mx-auto animate-pulse" />
          <h2 className="text-2xl font-black uppercase tracking-tight">HIGH RISK DETECTED</h2>
          <p className="text-xs text-red-100 font-medium">
            Immediate Clinical Evaluation & Diagnostic Electrophoresis Required.
          </p>
        </div>

        <div className="bg-white border-2 border-red-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-start space-x-3">
            <Building2 className="w-8 h-8 text-blue-900 flex-shrink-0 mt-1" />
            <div>
              <span className="text-[10px] font-bold bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full uppercase">
                Nearest Specialized Facility
              </span>
              <h3 className="text-lg font-bold text-slate-900 leading-snug mt-1">
                Korle-Bu Teaching Hospital (SCD Clinic)
              </h3>
              <p className="text-xs text-slate-500">Guggisberg Ave, Korle Gonno, Accra</p>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
            <p className="text-xs font-semibold text-slate-700">Capabilities:</p>
            <div className="flex flex-wrap gap-1">
              {['HPLC', 'Isoelectric Focusing', 'Pediatric ICU', 'Blood Transfusion'].map((cap) => (
                <span key={cap} className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
                  {cap}
                </span>
              ))}
            </div>
          </div>

          <a
            href="tel:+233302665401"
            className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-bold flex items-center justify-center space-x-3 shadow-lg shadow-red-600/30 active:scale-95 transition"
          >
            <PhoneCall className="w-5 h-5" />
            <span>Call Referral Center Now (+233 302 665401)</span>
          </a>
        </div>

        <button
          onClick={onComplete}
          className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-slate-800 transition"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (result === 'LOW_RISK') {
    return (
      <div className="p-4 max-w-md mx-auto space-y-5 animate-in fade-in duration-300">
        <div className="bg-emerald-600 text-white p-5 rounded-2xl shadow-lg border border-emerald-700 text-center space-y-2">
          <CheckCircle className="w-12 h-12 mx-auto" />
          <h2 className="text-2xl font-black uppercase tracking-tight">LOW RISK ASSESSMENT</h2>
          <p className="text-xs text-emerald-100 font-medium">
            No critical indicators found today. Provide preventive guidance.
          </p>
        </div>

        <TwiAudioPlayer
          audioUrl="/audio/twi_low_risk_guidance.mp3"
          textEnglish="Keep child hydrated daily. Provide folic acid supplements and ensure regular vaccinations."
          textTwi="Ma abofra no nsu pii da biara. Ma no Folic Acid nnuru na hwɛ se ogye aduro a ɛbɔ ne ho ban bere biara."
        />

        <button
          onClick={onComplete}
          className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-slate-800 transition"
        >
          Complete Screening & Save
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl border border-slate-200 shadow-md p-5 space-y-6">
      <div className="flex items-center justify-between border-b pb-3">
        <button
          onClick={() => step > 0 && setStep(step - 1)}
          disabled={step === 0}
          className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">
          Question {step + 1} of {SCREENING_QUESTIONS.length}
        </span>
        <span className="text-xs font-semibold text-blue-900 bg-blue-50 px-2 py-0.5 rounded">
          {childName}
        </span>
      </div>

      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div
          className="bg-blue-900 h-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="space-y-3 py-4 min-h-[160px]">
        <h3 className="text-xl font-bold text-slate-900 leading-snug">{currentQ.text}</h3>
        <p className="text-sm text-slate-500 font-medium">{currentQ.subtext}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => handleAnswer(false)}
          className="min-h-[56px] border-2 border-slate-200 hover:border-slate-400 text-slate-800 font-bold text-lg rounded-xl active:bg-slate-100 transition shadow-sm"
        >
          NO
        </button>
        <button
          onClick={() => handleAnswer(true)}
          className="min-h-[56px] bg-blue-900 hover:bg-blue-800 text-white font-bold text-lg rounded-xl active:scale-95 transition shadow-md shadow-blue-900/20"
        >
          YES
        </button>
      </div>
    </div>
  );
};
