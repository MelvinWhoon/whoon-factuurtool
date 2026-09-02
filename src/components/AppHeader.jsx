import { Link } from 'react-router-dom';

export default function AppHeader({ userEmail, onSignOut }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-wrap items-baseline gap-4">
        <Link className="text-2xl font-bold tracking-tight hover:text-slate-700" to="/">
          Facturen
        </Link>
        <Link className="text-sm font-medium text-slate-500 hover:text-slate-800" to="/analyse">
          Analyse
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
