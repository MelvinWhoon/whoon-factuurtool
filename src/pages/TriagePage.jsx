import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchUnclassifiedInvoices, markSenderDomainIrrelevant, updateInvoiceLogictradeRelevant } from '../api';
import AppHeader from '../components/AppHeader';
import InvoicePdf from '../components/InvoicePdf';
import StatusBox from '../components/StatusBox';

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('nl-NL', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export default function TriagePage({ userEmail, userId, onSignOut }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [openId, setOpenId] = useState(null);

  function load() {
    setLoading(true);
    setError('');
    return fetchUnclassifiedInvoices()
      .then((rows) => setInvoices(rows))
      .catch((err) => setError(err.message || 'Kon te classificeren facturen niet laden.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleChoice(invoice, relevant) {
    setBusyId(invoice.id);
    setError('');
    try {
      await updateInvoiceLogictradeRelevant(invoice.id, relevant);
      // Bij "niet relevant" ook het afzenderdomein onthouden: toekomstige mail
      // van hetzelfde domein wordt dan door de intake-workflow vanzelf
      // overgeslagen, zonder dat dit tabblad daar nog een keer voor nodig is.
      if (relevant === false) {
        await markSenderDomainIrrelevant(invoice.id, invoice.email_meta?.from, userId);
      }
      setInvoices((prev) => prev.filter((i) => i.id !== invoice.id));
    } catch (err) {
      setError(err.message || 'Kon de keuze niet opslaan.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <AppHeader userEmail={userEmail} onSignOut={onSignOut} />

        <div className="mt-4">
          <Link className="text-xs text-slate-600 hover:underline" to="/">
            ← Terug naar het overzicht
          </Link>
        </div>

        <section className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-700">Te classificeren</p>
          <p className="mt-2 text-sm text-slate-500">
            Facturen die niet als bekende leverancier herkend zijn (bv. Cookiebot, Google Ads,
            nutsfacturen). Geef per factuur aan of hij ooit tegen een inkooporder in LogicTrade
            gelegd moet worden. <strong>"Geen LogicTrade vergelijking mogelijk"</strong> onthoudt ook
            het afzenderdomein: toekomstige mail van datzelfde domein wordt daarna automatisch
            overgeslagen en komt hier niet meer terug.
          </p>
        </section>

        {loading && <StatusBox>Laden…</StatusBox>}
        {error && <StatusBox type="error">{error}</StatusBox>}

        {!loading && !error && invoices.length === 0 && (
          <StatusBox>Niets meer te classificeren — alles is beoordeeld.</StatusBox>
        )}

        <div className="mt-4 space-y-4">
          {invoices.map((invoice) => {
            const subject = invoice.email_meta?.subject || '(geen onderwerp)';
            const from = invoice.email_meta?.from;
            const isOpen = openId === invoice.id;
            return (
              <section key={invoice.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{subject}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {from ? `${from} · ` : ''}
                      {formatDate(invoice.invoice_date || invoice.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="inline-flex rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50"
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : invoice.id)}
                      disabled={!invoice.supplier_pdf_storage_key}
                      title={!invoice.supplier_pdf_storage_key ? 'Geen PDF opgeslagen bij deze mail.' : undefined}
                    >
                      {isOpen ? 'Verberg PDF' : 'Bekijk PDF'}
                    </button>
                    <button
                      className="inline-flex rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:opacity-50"
                      type="button"
                      disabled={busyId === invoice.id}
                      onClick={() => handleChoice(invoice, false)}
                    >
                      Geen LogicTrade vergelijking mogelijk
                    </button>
                    <button
                      className="inline-flex rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
                      type="button"
                      disabled={busyId === invoice.id}
                      onClick={() => handleChoice(invoice, true)}
                    >
                      Wel LogicTrade koppeling mogelijk
                    </button>
                  </div>
                </div>
                {isOpen && <InvoicePdf storageKey={invoice.supplier_pdf_storage_key} />}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
