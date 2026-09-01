const STYLES = {
  checked: 'border-emerald-300 bg-emerald-100 text-emerald-800',
  rejected: 'border-rose-300 bg-rose-100 text-rose-800',
  unlinked: 'border-slate-300 bg-slate-100 text-slate-700',
  price: 'border-amber-300 bg-amber-100 text-amber-800',
  ok: 'border-sky-300 bg-sky-100 text-sky-800',
};

export default function StatusBadge({ status }) {
  const className = STYLES[status?.key] || STYLES.ok;
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${className}`}>
      {status?.label || '-'}
    </span>
  );
}
