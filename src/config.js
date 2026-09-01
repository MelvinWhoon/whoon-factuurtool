export const APP_TITLE = import.meta.env.VITE_APP_TITLE || 'Facturen - Whoon';

// Geen hardcoded fallback: een vergeten env var mag nooit stilletjes naar de
// verkeerde omgeving wijzen. Zet VITE_SUPABASE_URL in de build-env. Dezelfde
// Supabase-project als de Ordervergelijker (whoon-ordertool) — gedeelde
// database (schema whoon) en gedeelde auth-sessie (zelfde origin, order.whoon.com).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export const TENANTS_TABLE_SCHEMA = import.meta.env.VITE_TENANTS_TABLE_SCHEMA || 'public';
export const TENANTS_TABLE_NAME = import.meta.env.VITE_TENANTS_TABLE_NAME || 'user_tenants';
export const TENANTS_USER_ID_COLUMN = import.meta.env.VITE_TENANTS_USER_ID_COLUMN || 'user_id';
export const TENANTS_SCHEMA_NAME_COLUMN =
  import.meta.env.VITE_TENANTS_SCHEMA_NAME_COLUMN || 'schema_name';

export const DEFAULT_SCHEMA = import.meta.env.VITE_DEFAULT_SCHEMA || 'whoon';

// Zelfde bucket als de Ordervergelijker gebruikt; factuur-PDFs staan daar
// onder de prefix 'invoices/'.
export const SUPPLIER_PDF_BUCKET = import.meta.env.VITE_SUPPLIER_PDF_BUCKET || 'supplier-pdfs';

// Pad waarachter deze app in Vercel wordt geproxied (zie vercel.json-rewrite
// in whoon-ordertool). Nodig voor de React Router basename.
export const BASE_PATH = '/facturen';

// Terug naar de hoofd-tool om in te loggen (deze app heeft geen eigen
// login-scherm - de auth-sessie wordt gedeeld via hetzelfde domein/origin).
export const MAIN_APP_LOGIN_URL = import.meta.env.VITE_MAIN_APP_LOGIN_URL || '/';
