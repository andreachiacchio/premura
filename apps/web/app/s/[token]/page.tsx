import { getDb } from '@/lib/db';
import { loadSurveyByToken, trackSurveyOpen } from '@premura/agents';
import { SurveyAlreadySubmitted } from './_components/SurveyAlreadySubmitted';
import { SurveyApp } from './_components/SurveyApp';
import { SurveyExpired } from './_components/SurveyExpired';
import { SurveyInvalid } from './_components/SurveyInvalid';

// Slice B — Mini web app survey pubblica.
//
// Auth: NESSUNA. Token JWT signed nell'URL = sicurezza.
// Mobile-first: 1 domanda per schermata, tap-friendly.

export const dynamic = 'force-dynamic';

export default async function SurveyPublicPage(props: {
  params: Promise<{ token: string }>;
}): Promise<React.JSX.Element> {
  const { token } = await props.params;
  const { db } = await getDb();

  const result = await loadSurveyByToken(db, token);

  if (!result.ok) {
    if (result.reason === 'expired') {
      return <SurveyExpired />;
    }
    return <SurveyInvalid />;
  }

  const survey = result.survey;

  // Track open analytics (fire-and-forget; await OK qui, e' veloce).
  await trackSurveyOpen(db, survey.quizId).catch(() => {});

  if (survey.alreadySubmitted) {
    return (
      <SurveyAlreadySubmitted
        guestFirstName={survey.guestFirstName}
        hostName={survey.hostName}
        propertyName={survey.propertyName}
        language={survey.language}
      />
    );
  }

  return (
    <SurveyApp
      token={token}
      questions={survey.questions}
      language={survey.language}
      guestFirstName={survey.guestFirstName}
      hostName={survey.hostName}
      propertyName={survey.propertyName}
    />
  );
}
