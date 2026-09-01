import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchInvoices } from '../api';
import AppHeader from '../components/AppHeader';
import StatusBadge from '../components/StatusBadge';
import StatusBox from '../components/StatusBox';

const FILTERS = [
  { key: 'all', label: 'Alle' },
  { key: 'todo', label: 'Te beoordelen' },
  { key: 'price', label: 'Prijsafwijking' },
  { key: 'unlinked', label: 'Niet gekoppeld' },
  { key: 'checked', label: 'In orde' },
];

function formatMoney(value) {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('nl-NL', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export default function InvoicesPage({ userEmail, onSignOut }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');

    fetchInvoices()
      .then((rows) => {
        if (mounted) setInvoices(rows);
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'Kon facturen niet laden.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const counts = useMemo(() => {
    const result = { all: invoices.length, todo: 0, price: 0, unlinked: 0, checked: 0 };
    for (const invoice of invoices) {
      if (invoice.checked === null || invoice.checked === undefined) result.todo += 1;
      if (invoice.status.key === 'price') result.price += 1;
      if (invoice.status.key === 'unlinked') result.unlinked += 1;
      if (invoice.status.key === 'checked') result.checked += 1;
    }
    return result;
  }, [invoices]);

  const filtered = useMemo(() => {
    if (filter === 'all') return invoices;
    if (filter === 'todo') return invoices.filter((i) => i.checked === null || i.checked === undefined);
    return invoices.filter((i) => i.status.key === filter);
  }, [invoices, filter]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <AppHeader userEmail={userEmail} onSignOut={onSignOut} />

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-700">Inkoopfacturen</p>
          <p className="mt-2 text-sm text-slate-500">
            Facturen uit invoice@whoon.com, per regel vergeleken met de inkooporder.
          </p>
        </section>

        {loading && <StatusBox>Facturen laden…</StatusBox>}
        {error && <StatusBox type="error">{error}</StatusBox>}

        {!loading && !error && (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
              <span className="font-medium text-slate-700">Filters</span>
              {FILTERS.map((option) => (
                <button
                  key={option.key}
                  className={`rounded-md px-2.5 py-1 ring-1 transition ${
                    filter === option.key
                      ? 'bg-slate-900 text-white ring-slate-900'
                      : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                  }`}
                  type="button"
                  onClick={() => setFilter(option.key)}
                >
                  {option.label} ({counts[option.key] ?? 0})
                </button>
              ))}
            </div>

            {invoices.length === 0 ? (
              <StatusBox>
                Nog geen facturen verwerkt. Zodra de intake-workflow draait, verschijnen ze hier
                automatisch.
              </StatusBox>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                      <th className="px-4 py-2.5">Factuur #</th>
                      <th className="px-4 py-2.5">Leverancier</th>
                      <th className="px-4 py-2.5">Factuurdatum</th>
                      <th className="px-4 py-2.5">Inkooporders</th>
                      <th className="px-4 py-2.5">Regels</th>
                      <th className="px-4 py-2.5">Bedrag</th>
                      <th className="px-4 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((invoice) => (
                      <tr
                        key={invoice.id}
                        className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {/* Paden zijn relatief aan de router-basename
                              (/facturen), dus hier géén /facturen-prefix. */}
                          <Link className="hover:underline" to={`/${invoice.id}`}>
                            {invoice.invoice_number || '(geen nummer)'}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5">{invoice.supplier}</td>
                        <td className="px-4 py-2.5">{formatDate(invoice.invoice_date)}</td>
                        <td className="px-4 py-2.5">{invoice.orderCount}</td>
                        <td className="px-4 py-2.5">{invoice.lineCount}</td>
                        <td className="px-4 py-2.5">{formatMoney(invoice.totalAmount)}</td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={invoice.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
