'use client';

import type { QuestionPlan, SurveyResponse } from '@premura/db';
import { Check, ChevronLeft } from 'lucide-react';
import { useState, useTransition } from 'react';
import { type SubmitSurveyActionResult, submitSurveyAction } from '../actions';

// Slice B — Mini web app tap survey.
// One question per screen, mobile-first, tap-to-advance.

type Props = {
  token: string;
  questions: QuestionPlan[];
  language: 'it' | 'en';
  guestFirstName: string;
  hostName: string;
  propertyName: string;
};

type Step =
  | { kind: 'question'; index: number }
  | { kind: 'submitting' }
  | { kind: 'thanks' }
  | { kind: 'error'; reason: string };

export function SurveyApp({
  token,
  questions,
  language,
  guestFirstName,
  hostName,
  propertyName,
}: Props): React.JSX.Element {
  const [step, setStep] = useState<Step>({ kind: 'question', index: 0 });
  const [responses, setResponses] = useState<Record<string, SurveyResponse>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const t = (it: string, en: string): string => (language === 'en' ? en : it);

  const submit = (): void => {
    startTransition(async () => {
      setStep({ kind: 'submitting' });
      // Apply otherTexts: per ogni qid che ha 'other' selezionato + testo,
      // appendi "|<text>" al value.
      const finalResponses: Record<string, SurveyResponse> = {};
      for (const [qid, val] of Object.entries(responses)) {
        const text = otherTexts[qid];
        if (Array.isArray(val)) {
          finalResponses[qid] = val.map((v) => (v === 'other' && text ? `other|${text}` : v));
        } else {
          finalResponses[qid] = val === 'other' && text ? `other|${text}` : val;
        }
      }
      let result: SubmitSurveyActionResult;
      try {
        result = await submitSurveyAction(token, finalResponses);
      } catch (err) {
        setStep({ kind: 'error', reason: err instanceof Error ? err.message : 'network_error' });
        return;
      }
      if (!result.ok) {
        setStep({ kind: 'error', reason: result.reason });
        return;
      }
      setStep({ kind: 'thanks' });
    });
  };

  if (step.kind === 'thanks') {
    return (
      <ThanksScreen
        guestFirstName={guestFirstName}
        hostName={hostName}
        propertyName={propertyName}
        language={language}
      />
    );
  }

  if (step.kind === 'error') {
    return (
      <Shell hostName={hostName} propertyName={propertyName}>
        <div className="rounded-card border border-alert/30 bg-paper px-5 py-6 text-center">
          <h2 className="font-serif text-h3 text-alert">
            {t('Qualcosa e andato storto', 'Something went wrong')}
          </h2>
          <p className="mt-2 text-body-sm text-ink-soft">
            {t(
              `Riprova fra poco. Se il problema persiste, scrivi a ${hostName} direttamente.`,
              `Please try again shortly. If it persists, contact ${hostName} directly.`,
            )}
          </p>
          <button
            type="button"
            onClick={() => setStep({ kind: 'question', index: 0 })}
            className="mt-4 inline-flex h-12 items-center justify-center rounded-full bg-terracotta px-6 text-body font-medium text-paper shadow-sm hover:bg-terracotta-2"
          >
            {t('Riprova', 'Retry')}
          </button>
        </div>
      </Shell>
    );
  }

  if (step.kind === 'submitting') {
    return (
      <Shell hostName={hostName} propertyName={propertyName}>
        <div className="rounded-card bg-paper px-5 py-6 text-center">
          <p className="text-body text-ink-soft">{t('Sto inviando...', 'Submitting...')}</p>
        </div>
      </Shell>
    );
  }

  const currentIdx = step.index;
  const question = questions[currentIdx];
  if (!question) {
    // Edge case: index out of range, force submit.
    return (
      <Shell hostName={hostName} propertyName={propertyName}>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-terracotta px-6 text-body font-medium text-paper shadow-md hover:bg-terracotta-2 disabled:opacity-50"
        >
          {t('Manda', 'Send')} ✓
        </button>
      </Shell>
    );
  }

  const isLast = currentIdx === questions.length - 1;
  const prompt = language === 'en' ? question.prompt_en : question.prompt_it;
  const currentValue = responses[question.id];

  const handleSelectSingle = (value: string): void => {
    setResponses((r) => ({ ...r, [question.id]: value }));
    if (value !== 'other') {
      // auto-advance dopo 250ms (UX delight feedback prima di avanzare)
      setTimeout(() => {
        if (isLast) submit();
        else setStep({ kind: 'question', index: currentIdx + 1 });
      }, 250);
    }
  };

  const handleToggleMulti = (value: string): void => {
    const arr = (Array.isArray(currentValue) ? currentValue : []) as string[];
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    // 'none' e' esclusivo: se selezioni 'none' deselezioniamo tutto il resto
    // e viceversa. Pattern UX universale.
    let final: string[];
    if (value === 'none' && !arr.includes('none')) {
      final = ['none'];
    } else if (value !== 'none' && arr.includes('none') && next.includes(value)) {
      final = next.filter((v) => v !== 'none');
    } else {
      final = next;
    }
    setResponses((r) => ({ ...r, [question.id]: final }));
  };

  const advance = (): void => {
    if (question.required) {
      const val = responses[question.id];
      if (!val || (Array.isArray(val) && val.length === 0)) {
        return;
      }
    }
    if (isLast) submit();
    else setStep({ kind: 'question', index: currentIdx + 1 });
  };

  const back = (): void => {
    if (currentIdx > 0) setStep({ kind: 'question', index: currentIdx - 1 });
  };

  const isOtherSelected =
    question.type === 'single_choice'
      ? currentValue === 'other'
      : Array.isArray(currentValue) && currentValue.includes('other');

  return (
    <Shell hostName={hostName} propertyName={propertyName}>
      <div className="flex items-center justify-between text-eyebrow uppercase tracking-wider text-ink-mute">
        <button
          type="button"
          onClick={back}
          disabled={currentIdx === 0}
          className="inline-flex items-center gap-1 disabled:opacity-30"
          aria-label={t('Torna indietro', 'Back')}
        >
          <ChevronLeft aria-hidden className="size-4" />
          {t('Indietro', 'Back')}
        </button>
        <span>
          {currentIdx + 1} / {questions.length}
        </span>
      </div>

      <h2 className="mt-4 font-serif text-h2 leading-tight text-ink">{prompt}</h2>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {question.options.map((opt) => {
          const label = language === 'en' ? opt.label_en : opt.label_it;
          const selected =
            question.type === 'single_choice'
              ? currentValue === opt.value
              : Array.isArray(currentValue) && currentValue.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                question.type === 'single_choice'
                  ? handleSelectSingle(opt.value)
                  : handleToggleMulti(opt.value)
              }
              className={`flex flex-col items-center justify-center rounded-card border px-3 py-4 text-center transition-colors ${selected ? 'border-terracotta bg-peach text-terracotta-2' : 'border-line bg-paper hover:bg-line-soft'}`}
              aria-pressed={selected}
            >
              <span className="text-3xl" aria-hidden>
                {opt.emoji}
              </span>
              <span className="mt-1.5 text-body-sm font-medium text-ink">{label}</span>
              {selected && question.type === 'multi_choice' ? (
                <Check
                  aria-hidden
                  className="absolute mt-1 size-4 rounded-full bg-terracotta p-0.5 text-paper"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {isOtherSelected ? (
        <input
          type="text"
          value={otherTexts[question.id] ?? ''}
          onChange={(e) => setOtherTexts((o) => ({ ...o, [question.id]: e.target.value }))}
          placeholder={t('Specifica...', 'Specify...')}
          maxLength={200}
          className="mt-4 h-12 w-full rounded-card-sm border border-line bg-paper px-4 text-body text-ink focus:border-terracotta-soft focus:outline-none"
          aria-label={t('Specifica', 'Specify')}
        />
      ) : null}

      <button
        type="button"
        onClick={advance}
        disabled={pending}
        className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-terracotta px-6 text-body font-medium text-paper shadow-md hover:bg-terracotta-2 disabled:opacity-50"
      >
        {isLast ? t('Manda', 'Send') : t('Continua', 'Continue')}
        {isLast ? ' ✓' : ' →'}
      </button>
    </Shell>
  );
}

function Shell({
  children,
  hostName,
  propertyName,
}: {
  children: React.ReactNode;
  hostName: string;
  propertyName: string;
}): React.JSX.Element {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-6 pb-16">
      <header className="mb-2 text-center">
        <span className="font-serif text-body-sm text-terracotta-2">Premura</span>
        <p className="mt-0.5 text-eyebrow uppercase tracking-wider text-ink-mute">
          {hostName} · {propertyName}
        </p>
      </header>
      <section className="mt-6">{children}</section>
    </main>
  );
}

function ThanksScreen({
  guestFirstName,
  hostName,
  propertyName,
  language,
}: {
  guestFirstName: string;
  hostName: string;
  propertyName: string;
  language: 'it' | 'en';
}): React.JSX.Element {
  const t = (it: string, en: string): string => (language === 'en' ? en : it);
  return (
    <Shell hostName={hostName} propertyName={propertyName}>
      <div className="rounded-card border border-line-soft bg-paper px-5 py-10 text-center shadow-sm">
        <p className="text-5xl" aria-hidden>
          💛
        </p>
        <h2 className="mt-4 font-serif text-h2 leading-tight text-ink">
          {t(`Grazie ${guestFirstName}!`, `Thank you ${guestFirstName}!`)}
        </h2>
        <p className="mt-3 text-body text-ink-soft">
          {t(
            `${hostName} sta preparando tutto per voi.`,
            `${hostName} is getting everything ready for you.`,
          )}
        </p>
        <p className="mt-2 text-body-sm text-ink-mute">
          {t(`A presto a ${propertyName}.`, `See you soon at ${propertyName}.`)}
        </p>
      </div>
    </Shell>
  );
}
