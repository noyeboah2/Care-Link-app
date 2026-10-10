import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, ArrowLeft, HeartPulse } from 'lucide-react';
import { ReferralCard } from './ReferralCard';
import { TwiAudioPlayer } from './TwiAudioPlayer';
import { SCREENING_QUESTIONS, scoreAnswers } from '@/lib/risk';
import { submitScreening, SessionExpiredError } from '@/lib/offline';
import { useI18n } from '@/lib/i18n';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'queued' | 'error' | 'unsaved';

export const ScdScreeningWizard: React.FC<{ userId: string; childName: string; childId?: string | null; childArea?: string | null; onComplete: () => void }> = ({ userId, childName, childId = null, childArea = null, onComplete }) => {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<'HIGH_RISK' | 'LOW_RISK' | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [finalAnswers, setFinalAnswers] = useState<Record<string, boolean>>({});

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

  const saveScreening = async (answersToSave: Record<string, boolean>) => {
    if (!childId) {
      setSaveStatus('unsaved');
      return;
    }
    setSaveStatus('saving');
    try {
      const outcome = await submitScreening(userId, { childId, answers: answersToSave });
      setSaveStatus(outcome.status === 'queued' ? 'queued' : 'saved');
    } catch (err) {
      if (err instanceof SessionExpiredError) { window.location.reload(); return; }
      setSaveStatus('error');
    }
  };

  const evaluateRisk = (answersFinal: Record<string, boolean>) => {
    setIsSubmitting(true);
    setFinalAnswers(answersFinal);
    const { riskLevel } = scoreAnswers(answersFinal);
    void saveScreening(answersFinal);

    setTimeout(() => {
      setIsSubmitting(false);
      setResult(riskLevel);
    }, 600);
  };

  const saveBanner = (
    <div
      className={`text-xs font-semibold text-center rounded-xl px-3 py-2 ${
        saveStatus === 'saved'
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          : saveStatus === 'queued'
          ? 'bg-sky-50 text-sky-900 border border-sky-200'
          : saveStatus === 'error'
          ? 'bg-red-50 text-red-800 border border-red-200'
          : 'bg-amber-50 text-amber-800 border border-amber-200'
      }`}
    >
      {saveStatus === 'saving' && t('Saving result...')}
      {saveStatus === 'saved' && t('Result saved to the child’s record.')}
      {saveStatus === 'queued' && t('Saved on this phone. It will upload automatically when you are back online.')}
      {saveStatus === 'unsaved' && t('Not saved: start the screening from a child’s card on the dashboard.')}
      {saveStatus === 'error' && (
        <span>
          {t('Could not save the result.')}{' '}
          <button onClick={() => saveScreening(finalAnswers)} className="underline font-bold">{t('Try again')}</button>
        </span>
      )}
    </div>
  );

  if (isSubmitting) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center p-6 space-y-4">
        <HeartPulse className="w-16 h-16 text-brand animate-bounce" />
        <h3 className="text-lg font-bold text-slate-800">{t('Checking the answers...')}</h3>
        <p className="text-sm text-slate-500">{t('Working out the risk for {name}', { name: childName })}</p>
      </div>
    );
  }

  if (result === 'HIGH_RISK') {
    return (
      <div className="p-4 max-w-2xl mx-auto space-y-5 animate-in fade-in duration-300">
        <div className="bg-red-600 text-white p-5 rounded-2xl shadow-lg border border-red-700 text-center space-y-2">
          <AlertTriangle className="w-12 h-12 mx-auto animate-pulse" />
          <h2 className="text-2xl font-black uppercase tracking-tight">{t('HIGH RISK DETECTED')}</h2>
          <p className="text-xs text-red-100 font-medium">{t('Immediate Clinical Evaluation & Diagnostic Electrophoresis Required.')}</p>
        </div>

        <ReferralCard areaId={childArea} />

        {saveBanner}

        <button
          onClick={onComplete}
          className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-slate-800 transition"
        >{t('Return to Dashboard')}</button>
      </div>
    );
  }

  if (result === 'LOW_RISK') {
    return (
      <div className="p-4 max-w-2xl mx-auto space-y-5 animate-in fade-in duration-300">
        <div className="bg-emerald-600 text-white p-5 rounded-2xl shadow-lg border border-emerald-700 text-center space-y-2">
          <CheckCircle className="w-12 h-12 mx-auto" />
          <h2 className="text-2xl font-black uppercase tracking-tight">{t('LOW RISK ASSESSMENT')}</h2>
          <p className="text-xs text-emerald-100 font-medium">{t('No critical indicators found today. Provide preventive guidance.')}</p>
        </div>

        <TwiAudioPlayer
          audioUrl="/audio/twi_low_risk_guidance.mp3"
          textEnglish="Keep child hydrated daily. Provide folic acid supplements and ensure regular vaccinations."
          textTwi="Ma abofra no nsu pii da biara. Ma no Folic Acid nnuru na hwɛ se ogye aduro a ɛbɔ ne ho ban bere biara."
        />

        {saveBanner}

        <button
          onClick={onComplete}
          className="w-full bg-slate-900 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-slate-800 transition"
        >{t('Done')}</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-md p-5 space-y-6">
      <div className="flex items-center justify-between border-b pb-3">
        <button
          onClick={() => step > 0 && setStep(step - 1)}
          disabled={step === 0}
          className="text-slate-400 hover:text-slate-700 disabled:opacity-30"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">
          {t('Question {n} of {total}', { n: step + 1, total: SCREENING_QUESTIONS.length })}
        </span>
        <span className="text-xs font-semibold text-brand bg-blue-50 px-2 py-0.5 rounded">
          {childName}
        </span>
      </div>

      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div
          className="bg-brand h-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="space-y-3 py-4 min-h-[160px]">
        <h3 className="text-xl font-bold text-slate-900 leading-snug">{t(currentQ.text)}</h3>
        <p className="text-sm text-slate-500 font-medium">{t(currentQ.subtext)}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => handleAnswer(false)}
          className="min-h-[56px] border-2 border-slate-200 hover:border-slate-400 text-slate-800 font-bold text-lg rounded-xl active:bg-slate-100 transition shadow-sm"
        >{t('NO')}</button>
        <button
          onClick={() => handleAnswer(true)}
          className="min-h-[56px] bg-brand hover:bg-brand-dark text-white font-bold text-lg rounded-xl active:scale-95 transition shadow-md shadow-blue-900/20"
        >{t('YES')}</button>
      </div>
    </div>
  );
};
