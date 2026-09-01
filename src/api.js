import {
  DEFAULT_SCHEMA,
  TENANTS_TABLE_NAME,
  TENANTS_TABLE_SCHEMA,
  TENANTS_USER_ID_COLUMN,
} from './config';
import { supabase } from './supabaseClient';

function tenantsQuery() {
  return supabase.schema(TENANTS_TABLE_SCHEMA).from(TENANTS_TABLE_NAME);
}

function invoicesQuery(schemaName = DEFAULT_SCHEMA) {
  return supabase.schema(schemaName).from('purchase_invoices');
}

function invoiceLinesQuery(schemaName = DEFAULT_SCHEMA) {
  return supabase.schema(schemaName).from('purchase_invoice_lines');
}

/** Rol van de ingelogde gebruiker: 'admin' | 'medewerker' (default 'medewerker').
 * Zelfde tabel als whoon-ordertool (public.user_tenants) - deze app deelt de
 * database, dus admins in de Ordervergelijker zijn ook admin hier. */
export async function fetchUserRole(userId) {
  const { data, error } = await tenantsQuery()
    .select('role')
    .eq(TENANTS_USER_ID_COLUMN, userId)
    .limit(1)
    .maybeSingle();
  if (error) {
    // Bij twijfel: minst bevoorrecht.
    return 'medewerker';
  }
  return data?.role === 'admin' ? 'admin' : 'medewerker';
}

/** Afgeleide status van een factuur, op basis van de regels eronder. Bewust
 * hier berekend (niet in de database): het is puur presentatie, en zo blijft
 * de waarheid over prijzen/koppelingen op één plek staan (de regels zelf). */
export function deriveInvoiceStatus(invoice, lines) {
  const relevant = lines || [];
  const unmatched = relevant.filter((l) => l.match_status !== 'matched').length;
  const outOfTolerance = relevant.filter(
    (l) => l.match_status === 'matched' && l.price_within_tolerance === false
  ).length;

  if (invoice.checked === true) return { key: 'checked', label: 'In orde', unmatched, outOfTolerance };
  if (invoice.checked === false)
    return { key: 'rejected', label: 'Niet in orde', unmatched, outOfTolerance };
  if (unmatched > 0)
    return { key: 'unlinked', label: 'Niet gekoppeld', unmatched, outOfTolerance };
  if (outOfTolerance > 0)
    return { key: 'price', label: 'Prijsafwijking', unmatched, outOfTolerance };
  return { key: 'ok', label: 'Klopt', unmatched, outOfTolerance };
}

export async function fetchInvoices(schemaName = DEFAULT_SCHEMA) {
  const { data, error } = await invoicesQuery(schemaName)
    .select('id, supplier, invoice_number, invoice_date, checked, checked_by, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message || 'Kon facturen niet laden.');
  const invoices = data || [];
  if (invoices.length === 0) return [];

  // Regels in één keer ophalen voor alle facturen op deze pagina, i.p.v. een
  // query per factuur (N+1). Alleen de velden die de lijst nodig heeft.
  const { data: lineRows, error: linesError } = await invoiceLinesQuery(schemaName)
    .select('purchase_invoice_id, purchase_order_number, external_order_number, match_status, price_within_tolerance, line_price')
    .in('purchase_invoice_id', invoices.map((i) => i.id));

  if (linesError) throw new Error(linesError.message || 'Kon factuurregels niet laden.');

  const linesByInvoice = new Map();
  for (const line of lineRows || []) {
    const list = linesByInvoice.get(line.purchase_invoice_id) || [];
    list.push(line);
    linesByInvoice.set(line.purchase_invoice_id, list);
  }

  return invoices.map((invoice) => {
    const lines = linesByInvoice.get(invoice.id) || [];
    const orderNumbers = new Set(
      lines
        .map((l) => l.purchase_order_number || l.external_order_number)
        .filter((value) => Boolean(value))
    );
    return {
      ...invoice,
      lineCount: lines.length,
      orderCount: orderNumbers.size,
      totalAmount: lines.reduce((sum, l) => sum + (Number(l.line_price) || 0), 0),
      status: deriveInvoiceStatus(invoice, lines),
    };
  });
}

export async function fetchInvoice(invoiceId, schemaName = DEFAULT_SCHEMA) {
  const { data: invoice, error } = await invoicesQuery(schemaName)
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Kon factuur niet laden.');
  if (!invoice) throw new Error('Factuur niet gevonden.');

  const { data: lines, error: linesError } = await invoiceLinesQuery(schemaName)
    .select('*')
    .eq('purchase_invoice_id', invoiceId)
    .order('line_index', { ascending: true });

  if (linesError) throw new Error(linesError.message || 'Kon factuurregels niet laden.');

  return { invoice, lines: lines || [], status: deriveInvoiceStatus(invoice, lines || []) };
}

/** Zet het oordeel op een factuur. checked: true | false | null. */
export async function updateInvoiceChecked(invoiceId, checked, userId, schemaName = DEFAULT_SCHEMA) {
  const { error } = await invoicesQuery(schemaName)
    .update({ checked, checked_by: checked === null ? null : userId || null })
    .eq('id', invoiceId);

  if (error) throw new Error(error.message || 'Kon het oordeel niet opslaan.');
}
