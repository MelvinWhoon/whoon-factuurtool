import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchUnclassifiedInvoices } from '../api';

export default function AppHeader({ userEmail, onSignOut }) {
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    fetchUnclassifiedInvoices()
      .then((rows) => {
        if (mounted) setUnclassifiedCount(rows.length);
      })
      .catch(() => {
        // stil falen - dit is alleen een telbadge, geen kritieke data
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-wrap items-baseline gap-4">
        <Link className="text-2xl font-bold tracking-tight hover:text-slate-700" to="/">
          Facturen
        </Link>
        <Link className="text-sm font-medium text-slate-500 hover:text-slate-800" to="/analyse">
          Analyse
        </Link>
        <Link className="text-sm font-medium text-slate-500 hover:text-slate-800" to="/classificeren">
          Te classificeren
          {unclassifiedCount > 0 && (
            <span className="ml-1.5 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
              {unclassifiedCount}
            </span>
          )}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Terug naar de hoofd-tool: gewone <a>, want dat is een andere
            Vercel-zone (whoon-ordertool) - geen route binnen deze app. */}
        <a
          className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-200"
          href="/confirmations"
        >
          Naar Order Vergelijker
        </a>
        <span className="rounded-md bg-white px-2.5 py-1 text-slate-600 ring-1 ring-slate-200">
          {userEmail}
        </span>
        <button
          className="inline-flex rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white transition hover:bg-slate-700"
          type="button"
          onClick={onSignOut}
        >
          Uitloggen
        </button>
      </div>
    </header>
  );
}
