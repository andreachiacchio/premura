import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getOnboardingState, urlForStep } from '@/lib/onboarding';
import { redirect } from 'next/navigation';

// Slice 9 prep — entrypoint /onboarding.
//
// Resume capability: legge lo step corrente da DB e fa redirect alla
// pagina giusta. Se gia' completed, vai a /dashboard.

export const dynamic = 'force-dynamic';

export default async function OnboardingIndexPage() {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const state = await getOnboardingState(db, hostId);
  if (state.completed) redirect('/dashboard');
  redirect(urlForStep(state.step));
}
