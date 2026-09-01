export default function StatusBox({ type = 'info', children }) {
  const className =
    type === 'error'
      ? 'rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800'
      : 'rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700';
  return <div className={`mt-4 ${className}`}>{children}</div>;
}
