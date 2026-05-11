'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const REDIRECT_MS = 3000;

export function DoneRedirect(): React.JSX.Element {
  const router = useRouter();
  const [seconds, setSeconds] = useState(Math.ceil(REDIRECT_MS / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    const timeout = setTimeout(() => {
      router.replace('/dashboard');
    }, REDIRECT_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <p className="mt-8 text-body-sm text-ink-mute">
      Apertura dashboard in {seconds}…{' '}
      <a
        href="/dashboard"
        className="ml-1 font-medium text-terracotta underline-offset-2 hover:underline"
      >
        Vai subito
      </a>
    </p>
  );
}
