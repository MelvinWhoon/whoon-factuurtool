import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchInvoice, relinkInvoiceLines, updateInvoiceChecked, updateInvoiceNotes } from '../api';
import AppHeader from '../components/AppHeader';
import InvoicePdf from '../components/InvoicePdf';
import StatusBadge from '../components/StatusBadge';
import StatusBox from '../components/StatusBox';

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

export default function InvoicePage({ userEmail, userId, onSignOut }) {
  const { id } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSavedAt, setNotesSavedAt] = useState(0);
  const [relinking, setRelinking] = useState(false);
  const [relinkMessage, setRelinkMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');

    fetchInvoice(id)
      .then((result) => {
        if (mounted) {
          setData(result);
          setNotes(result.invoice.notes || '');
        }
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'Kon factuur niet laden.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id]);

  async function handleSaveNotes() {
    setNotesSaving(true);
    setError('');
    try {
      await updateInvoiceNotes(id, notes);
      setNotesSavedAt(Date.now());
    } catch (err) {
      setError(err.message || 'Kon de notitie niet opslaan.');
    } finally {
      setNotesSaving(false);
    }
  }

  async function handleRelink() {
    setRelinking(true);
    setError('');
    setRelinkMessage('');
    try {
      const result = await relinkInvoiceLines(id);
      const fresh = await fetchInvoice(id);
      setData(fresh);
      setNotes(fresh.invoice.notes || '');
      const orderLinked = result?.orderLinked || 0;
      const lineMatched = result?.lineMatched || 0;
      setRelinkMessage(
        orderLinked === 0
          ? 'De inkooporder(s) staan nog niet in onze database — waarschijnlijk nog niet gesynchroniseerd vanuit LogicTrade. Probeer het later opnieuw.'
          : `${orderLinked} regel(s) gekoppeld aan de inkooporder, waarvan ${lineMatched} ook aan een orderregel.`
      );
    } catch (err) {
      setError(err.message || 'Kon niet opnieuw koppelen.');
    } finally {
      setRelinking(false);
    }
  }

  // Regels groeperen per inkooporder: bij een verzamelfactuur (Room108, Hjort)
  // levert dit meerdere blokken op, bij een losse factuur precies één.
  const groups = useMemo(() => {
    if (!data) return [];
    const byOrder = new Map();
    for (const line of data.lines) {
      const key = line.purchase_order_number || line.external_order_number || '(niet gekoppeld)';
      const group = byOrder.get(key) || { orderKey: key, lines: [], salesOrderNumber: line.sales_order_number };
      group.lines.push(line);
      byOrder.set(key, group);
    }
    return Array.from(byOrder.values());
  }, [data]);

  async function handleSetChecked(checked) {
    setSaving(true);
    setError('');
    try {
      await updateInvoiceChecked(id, checked, userId);
      const fresh = await fetchInvoice(id);
      setData(fresh);
    } catch (err) {
      setError(err.message || 'Kon het oordeel niet opslaan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 px-4 py-6 pb-24 text-slate-900 sm:px-6">
      <div className="mx-auto w-full max-w-6xl">
        <AppHeader userEmail={userEmail} onSignOut={onSignOut} />

        <div className="mt-4">
          <Link className="text-xs text-slate-600 hover:underline" to="/">
            ← Terug naar het overzicht
          </Link>
        </div>

        {loading && <StatusBox>Factuur laden…</StatusBox>}
        {error && <StatusBox type="error">{error}</StatusBox>}

        {!loading && data && (
          <>
            <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-slate-900">
                    {data.invoice.supplier} — {data.invoice.invoice_number || '(geen nummer)'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Factuurdatum {formatDate(data.invoice.invoice_date)} · {groups.length}{' '}
                    {groups.length === 1 ? 'inkooporder' : 'inkooporders'} · {data.lines.length} regels
                  </p>
                </div>
                <StatusBadge status={data.status} />
              </div>

              {(data.status.unmatched > 0 || data.status.outOfTolerance > 0) && (
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  {data.status.unmatched > 0 && (
                    <li>
                      {data.status.unmatched} regel(s) konden niet aan een inkooporder-regel gekoppeld
                      worden — handmatig controleren.
                    </li>
                  )}
                  {data.status.outOfTolerance > 0 && (
                    <li>
                      {data.status.outOfTolerance} regel(s) duurder dan de inkooporder, buiten de
                      afgesproken marge.
                    </li>
                  )}
                </ul>
              )}

              {data.status.unmatched > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-500">
                    Facturen komen altijd ná de levering binnen — het is normaal dat de inkooporder er
                    bij intake nog niet stond. Probeer het opnieuw zodra deze is gesynchroniseerd.
                  </p>
                  <button
                    className="ml-auto inline-flex shrink-0 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-100 disabled:opacity-50"
                    type="button"
                    disabled={relinking}
                    onClick={handleRelink}
                  >
                    {relinking ? 'Bezig…' : 'Opnieuw proberen te koppelen'}
                  </button>
                </div>
              )}
              {relinkMessage && <p className="mt-2 text-xs text-slate-600">{relinkMessage}</p>}
            </section>

            <InvoicePdf storageKey={data.invoice.supplier_pdf_storage_key} />

            <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">Notitie</p>
                <button
                  className="inline-flex rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-50"
                  type="button"
                  disabled={notesSaving}
                  onClick={handleSaveNotes}
                >
                  {notesSaving ? 'Opslaan…' : 'Opslaan'}
                </button>
              </div>
              <textarea
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700"
                rows={2}
                placeholder="Bv. gebeld met leverancier, wacht op creditnota…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              {notesSavedAt > 0 && <p className="mt-1 text-xs text-emerald-700">Opgeslagen.</p>}
            </section>

            {groups.map((group) => {
              const groupTotal = group.lines.reduce((sum, l) => sum + (Number(l.line_price) || 0), 0);
              const sourceTotal = group.lines.reduce(
                (sum, l) => sum + (Number(l.source_line_price) || 0),
                0
              );
              return (
                <section
                  key={group.orderKey}
                  className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        Inkooporder {group.orderKey}
                      </p>
                      {group.salesOrderNumber && (
                        <p className="text-xs text-slate-500">
                          Verkooporder {group.salesOrderNumber} — op te zoeken in LogicTrade als de
                          koppeling hierboven niet lukt.
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Factuur {formatMoney(groupTotal)} · inkooporder {formatMoney(sourceTotal)}
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                          <th className="px-4 py-2">Omschrijving</th>
                          <th className="px-4 py-2">Aantal</th>
                          <th className="px-4 py-2">Factuur</th>
                          <th className="px-4 py-2">Inkooporder</th>
                          <th className="px-4 py-2">Verschil</th>
                          <th className="px-4 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.lines.map((line) => {
                          const isUnmatched = line.match_status !== 'matched';
                          const outOfTolerance = line.price_within_tolerance === false;
                          const rowClass = isUnmatched
                            ? 'bg-slate-50'
                            : outOfTolerance
                              ? 'bg-amber-50'
                              : '';
                          return (
                            <tr key={line.id} className={`border-b border-slate-100 last:border-0 ${rowClass}`}>
                              <td className="px-4 py-2">{line.description || '-'}</td>
                              <td className="px-4 py-2">{line.quantity ?? '-'}</td>
                              <td className="px-4 py-2">{formatMoney(line.line_price)}</td>
                              <td className="px-4 py-2">
                                {isUnmatched ? '-' : formatMoney(line.source_line_price)}
                              </td>
                              <td className="px-4 py-2">
                                {isUnmatched ? '-' : formatMoney(line.price_difference)}
                              </td>
                              <td className="px-4 py-2 text-xs">
                                {isUnmatched ? (
                                  <span className="text-slate-600">Niet gekoppeld</span>
                                ) : outOfTolerance ? (
                                  <span className="font-medium text-amber-800">Te duur</span>
                                ) : (
                                  <span className="text-emerald-700">Akkoord</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}

            <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
              <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-2">
                <button
                  className="inline-flex rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
                  type="button"
                  disabled={saving}
                  onClick={() => handleSetChecked(false)}
                >
                  Niet in orde
                </button>
                <button
                  className="inline-flex rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-50"
                  type="button"
                  disabled={saving}
                  onClick={() => handleSetChecked(null)}
                >
                  Ongekozen
                </button>
                <button
                  className="inline-flex rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                  type="button"
                  disabled={saving}
                  onClick={() => handleSetChecked(true)}
                >
                  In orde
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
