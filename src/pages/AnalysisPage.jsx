import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAnalytics } from '../api';
import AppHeader from '../components/AppHeader';
import StatusBox from '../components/StatusBox';

function formatMoney(value) {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatMonth(key) {
  const [year, month] = String(key).split('-');
  if (!year || !month) return key;
  return new Intl.DateTimeFormat('nl-NL', { month: 'short', year: 'numeric' }).format(
    new Date(Date.UTC(Number(year), Number(month) - 1, 1))
  );
}

// Klikbare cel: gaat naar de facturenlijst met dit filter alvast ingevuld,
// zodat "3 met prijsafwijking" ook echt te openen is.
function DrillCell({ value, onClick, muted = false }) {
  if (!value) {
    return <td className={`px-4 py-2.5 ${muted ? 'text-slate-400' : ''}`}>{value ?? 0}</td>;
  }
  return (
    <td className="px-4 py-2.5">
      <button
        className="rounded px-1.5 py-0.5 font-medium text-slate-800 underline decoration-slate-300 underline-offset-2 transition hover:bg-slate-100 hover:text-slate-950"
        type="button"
        onClick={onClick}
      >
        {value}
      </button>
    </td>
  );
}

function Bar({ value, max, className }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AnalysisPage({ userEmail, onSignOut }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    fetchAnalytics()
      .then((result) => mounted && setData(result))
      .catch((err) => mounted && setError(err.message || 'Kon analyse niet laden.'))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  function goToList(params) {
    const search = new URLSearchParams(params).toString();
    navigate(`/?${search}`);
  }

  const maxCount = useMemo(
    () => Math.max(1, ...(data?.perSupplier || []).map((s) => s.invoices)),
    [data]
  );
  const maxMonth = useMemo(
    () => Math.max(1, ...(data?.byMonth || []).map((m) => m.invoices)),
    [data]
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <AppHeader userEmail={userEmail} onSignOut={onSignOut} />

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-700">Analyse</p>
          <p className="mt-2 text-sm text-slate-500">
            Overzicht van gecontroleerde inkoopfacturen. Alle aantallen zijn aanklikbaar en
            openen de bijbehorende facturen.
          </p>
        </section>

        {loading && <StatusBox>Analyse laden…</StatusBox>}
        {error && <StatusBox type="error">{error}</StatusBox>}

        {!loading && !error && data && data.totals.invoices === 0 && (
          <StatusBox>Nog geen facturen verwerkt, dus nog niets te analyseren.</StatusBox>
        )}

        {!loading && !error && data && data.totals.invoices > 0 && (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <button
                className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                type="button"
                onClick={() => goToList({})}
              >
                <p className="text-xs font-medium text-slate-500">Facturen</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{data.totals.invoices}</p>
              </button>
              <button
                className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                type="button"
                onClick={() => goToList({ filter: 'todo' })}
              >
                <p className="text-xs font-medium text-slate-500">Te beoordelen</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{data.totals.todo}</p>
              </button>
              <button
                className="rounded-xl border border-amber-200 bg-white p-4 text-left transition hover:border-amber-300 hover:bg-amber-50"
                type="button"
                onClick={() => goToList({ filter: 'price' })}
              >
                <p className="text-xs font-medium text-slate-500">Met prijsafwijking</p>
                <p className="mt-1 text-2xl font-bold text-amber-700">{data.totals.withPriceIssue}</p>
              </button>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">Te veel gefactureerd</p>
                <p className="mt-1 text-2xl font-bold text-rose-700">
                  {formatMoney(data.totals.overchargeAmount)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-2.5">
                <p className="text-sm font-semibold text-slate-700">Per leverancier</p>
              </div>
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-2.5">Leverancier</th>
                    <th className="px-4 py-2.5">Facturen</th>
                    <th className="px-4 py-2.5">Verdeling</th>
                    <th className="px-4 py-2.5">Gefactureerd</th>
                    <th className="px-4 py-2.5">Te duur</th>
                    <th className="px-4 py-2.5">Niet gekoppeld</th>
                    <th className="px-4 py-2.5">Te veel</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perSupplier.map((row) => (
                    <tr key={row.supplier} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{row.supplier}</td>
                      <DrillCell
                        value={row.invoices}
                        onClick={() => goToList({ supplier: row.supplier })}
                      />
                      <td className="w-40 px-4 py-2.5">
                        <Bar value={row.invoices} max={maxCount} className="bg-slate-800" />
                      </td>
                      <td className="px-4 py-2.5">{formatMoney(row.totalAmount)}</td>
                      <DrillCell
                        value={row.priceIssueInvoices}
                        onClick={() => goToList({ supplier: row.supplier, filter: 'price' })}
                        muted
                      />
                      <DrillCell
                        value={row.unlinkedInvoices}
                        onClick={() => goToList({ supplier: row.supplier, filter: 'unlinked' })}
                        muted
                      />
                      <td className="px-4 py-2.5 font-medium text-rose-700">
                        {row.overcharge > 0 ? formatMoney(row.overcharge) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.topOvercharges.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-2.5">
                  <p className="text-sm font-semibold text-slate-700">
                    Grootste prijsafwijkingen per regel
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Klik op een regel om de bijbehorende factuur te openen.
                  </p>
                </div>
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                      <th className="px-4 py-2.5">Leverancier</th>
                      <th className="px-4 py-2.5">Factuur</th>
                      <th className="px-4 py-2.5">Omschrijving</th>
                      <th className="px-4 py-2.5">Inkooporder</th>
                      <th className="px-4 py-2.5">Factuur</th>
                      <th className="px-4 py-2.5">Verschil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topOvercharges.map((line) => (
                      <tr
                        key={line.id}
                        className="cursor-pointer border-b border-slate-100 transition last:border-0 hover:bg-amber-50"
                        onClick={() => navigate(`/${line.invoiceId}`)}
                      >
                        <td className="px-4 py-2.5">{line.supplier}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {line.invoiceNumber || '-'}
                        </td>
                        <td className="px-4 py-2.5">{line.description}</td>
                        <td className="px-4 py-2.5">{formatMoney(line.sourceLinePrice)}</td>
                        <td className="px-4 py-2.5">{formatMoney(line.linePrice)}</td>
                        <td className="px-4 py-2.5 font-medium text-rose-700">
                          +{formatMoney(line.priceDifference)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-2.5">
                <p className="text-sm font-semibold text-slate-700">Per maand</p>
              </div>
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-2.5">Maand</th>
                    <th className="px-4 py-2.5">Facturen</th>
                    <th className="px-4 py-2.5">Verdeling</th>
                    <th className="px-4 py-2.5">Bedrag</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byMonth.map((row) => (
                    <tr key={row.month} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5">{formatMonth(row.month)}</td>
                      <DrillCell
                        value={row.invoices}
                        onClick={() => goToList({ month: row.month })}
                      />
                      <td className="w-48 px-4 py-2.5">
                        <Bar value={row.invoices} max={maxMonth} className="bg-sky-600" />
                      </td>
                      <td className="px-4 py-2.5">{formatMoney(row.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
