import { useEffect, useState } from 'react';
import { SUPPLIER_PDF_BUCKET } from '../config';
import { supabase } from '../supabaseClient';

// De intake bewaart de key inclusief bucket-prefix ('supplier-pdfs/invoices/..'),
// maar storage.from(bucket) verwacht het pad ZONDER die prefix. Allebei
// afhandelen, zodat het werkt ongeacht hoe de key is weggeschreven.
function storagePath(rawKey) {
  if (!rawKey) return '';
  let key = String(rawKey).trim().replace(/^\/+/, '');
  const prefix = `${SUPPLIER_PDF_BUCKET}/`;
  if (key.startsWith(prefix)) key = key.slice(prefix.length);
  return key;
}

export default function InvoicePdf({ storageKey }) {
  const [signedUrl, setSignedUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const path = storagePath(storageKey);
    if (!path) {
      setSignedUrl('');
      setError('');
      return;
    }

    let mounted = true;
    setLoading(true);
    setError('');

    supabase.storage
      .from(SUPPLIER_PDF_BUCKET)
      .createSignedUrl(path, 60 * 30)
      .then(({ data, error: signErr }) => {
        if (!mounted) return;
        if (signErr || !data?.signedUrl) {
          setSignedUrl('');
          setError(`Kon de PDF niet openen (${path}).`);
          return;
        }
        setSignedUrl(data.signedUrl);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [storageKey]);

  if (!storageKey) {
    return (
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Geen PDF opgeslagen bij deze factuur.
      </section>
    );
  }

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
        <p className="text-sm font-semibold text-slate-700">Originele factuur</p>
        <div className="flex items-center gap-2 text-xs">
          <button
            className="inline-flex rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white transition hover:bg-slate-700"
            type="button"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Verberg PDF' : 'Toon PDF'}
          </button>
          {signedUrl && (
            <a
              className="inline-flex rounded-md bg-white px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-300 transition hover:bg-slate-50"
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open/Download
            </a>
          )}
        </div>
      </div>

      {loading && <p className="px-4 py-3 text-sm text-slate-500">PDF laden…</p>}
      {error && <p className="px-4 py-3 text-sm text-rose-700">{error}</p>}

      {open && signedUrl && (
        <iframe className="h-[70vh] w-full border-0" src={signedUrl} title="Originele factuur" />
      )}
    </section>
  );
}
