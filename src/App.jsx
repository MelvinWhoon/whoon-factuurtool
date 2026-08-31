import { useEffect, useState } from 'react';
import { APP_TITLE, MAIN_APP_LOGIN_URL } from './config';
import { supabase } from './supabaseClient';

// Minimaal scaffold (fase 1 van het plan): bevestigt dat deze losstaande app
// bereikbaar is via order.whoon.com/facturen en de auth-sessie deelt met de
// hoofd-tool (whoon-ordertool). Nog geen echte functionaliteit - dat komt in
// fase 2 (parser + database + review-scherm), zodra ook het 3e voorbeeld
// (Hjort) bekeken is.
export default function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    document.title = APP_TITLE;
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session || null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoadingSession(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto mt-16 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
        <h1 className="text-lg font-bold text-slate-900">Facturen</h1>

        {loadingSession && <p className="mt-3">Sessie laden…</p>}

        {!loadingSession && !session && (
          <div className="mt-3 space-y-3">
            <p>Je bent niet ingelogd.</p>
            <a
              className="inline-flex rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
              href={MAIN_APP_LOGIN_URL}
            >
              Naar inloggen (Order Vergelijker)
            </a>
          </div>
        )}

        {!loadingSession && session && (
          <div className="mt-3 space-y-1">
            <p>Ingelogd als {session.user.email}.</p>
            <p className="text-slate-500">
              Deze factuur-tool wordt binnenkort gebouwd — losstaand van de
              Ordervergelijker, met een gedeelde database.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
