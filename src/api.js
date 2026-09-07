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
  // Geen enkele regel: nooit "Klopt" - dat verbergt een intake-fout (parsen
  // mislukt, opslaan mislukt) achter een groen label. Vooral bij
  // verzamelfacturen kwam dit voor: 1 kapotte sectie liet de hele factuur
  // zonder regels achter terwijl de kop wel was opgeslagen.
  if (relevant.length === 0) return { key: 'empty', label: 'Geen regels', unmatched, outOfTolerance };
  if (unmatched > 0)
    return { key: 'unlinked', label: 'Niet gekoppeld', unmatched, outOfTolerance };
  if (outOfTolerance > 0)
    return { key: 'price', label: 'Prijsafwijking', unmatched, outOfTolerance };
  return { key: 'ok', label: 'Klopt', unmatched, outOfTolerance };
}

export async function fetchInvoices(schemaName = DEFAULT_SCHEMA) {
  // Niet-herkende facturen die nog niet getriageerd zijn ("Te classificeren")
  // of expliciet als niet-LogicTrade-relevant afgewezen zijn, horen niet in
  // dit overzicht - die staan in het triage-tabje resp. nergens meer.
  const { data, error } = await invoicesQuery(schemaName)
    .select('id, supplier, invoice_number, invoice_date, checked, checked_by, created_at')
    .or('recognized.eq.true,logictrade_relevant.eq.true')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message || 'Kon facturen niet laden.');
  const invoices = data || [];
  if (invoices.length === 0) return [];

  // Regels in één keer ophalen voor alle facturen op deze pagina, i.p.v. een
  // query per factuur (N+1). Alleen de velden die de lijst nodig heeft.
  const { data: lineRows, error: linesError } = await invoiceLinesQuery(schemaName)
    .select('purchase_invoice_id, purchase_order_number, external_order_number, sales_order_number, match_status, price_within_tolerance, line_price')
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
    // Los van orderCount (aantal inkooporders): het V-nummer telt niet mee
    // als aparte order, maar moet wel doorzoekbaar zijn.
    const searchNumbers = new Set([
      ...orderNumbers,
      ...lines.map((l) => l.sales_order_number).filter(Boolean),
    ]);
    return {
      ...invoice,
      lineCount: lines.length,
      orderCount: orderNumbers.size,
      orderNumbers: Array.from(searchNumbers),
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

/** Vrij notitieveld per factuur (bv. "gebeld met leverancier"). */
export async function updateInvoiceNotes(invoiceId, notes, schemaName = DEFAULT_SCHEMA) {
  const { error } = await invoicesQuery(schemaName)
    .update({ notes: notes || null })
    .eq('id', invoiceId);

  if (error) throw new Error(error.message || 'Kon de notitie niet opslaan.');
}

/** Facturen die niet als bekende leverancier herkend zijn en nog niet
 * getriageerd zijn - horen ze uberhaupt in LogicTrade thuis (bv. Cookiebot,
 * Google Ads, nutsfacturen horen er nooit in) of niet? */
export async function fetchUnclassifiedInvoices(schemaName = DEFAULT_SCHEMA) {
  const { data, error } = await invoicesQuery(schemaName)
    .select('id, invoice_date, supplier_pdf_storage_key, email_meta, created_at')
    .eq('recognized', false)
    .is('logictrade_relevant', null)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message || 'Kon te classificeren facturen niet laden.');
  return data || [];
}

/** Legt de triage-keuze vast: true = hoort in LogicTrade (verschijnt in het
 * hoofdoverzicht om alsnog te koppelen), false = hoort er nooit in thuis
 * (voorgoed verborgen). */
export async function updateInvoiceLogictradeRelevant(invoiceId, relevant, schemaName = DEFAULT_SCHEMA) {
  const { error } = await invoicesQuery(schemaName)
    .update({ logictrade_relevant: relevant })
    .eq('id', invoiceId);

  if (error) throw new Error(error.message || 'Kon de keuze niet opslaan.');
}

/** Probeert nog niet gekoppelde regels alsnog te koppelen aan de inkooporder.
 * Puur lezend richting LogicTrade: whoon.purchase_orders is de eigen,
 * periodiek gesynchroniseerde kopie - er wordt nooit rechtstreeks in
 * LogicTrade zelf geschreven of gezocht. Nuttig omdat facturen per definitie
 * ná de levering binnenkomen, dus de order kan bij intake nog ontbreken. */
export async function relinkInvoiceLines(invoiceId, schemaName = DEFAULT_SCHEMA) {
  const { data, error } = await supabase
    .schema(schemaName)
    .rpc('relink_invoice_lines', { p_invoice_id: invoiceId });

  if (error) throw new Error(error.message || 'Kon niet opnieuw koppelen.');
  return data;
}

/** Aggregaties voor de Analyse-pagina: per leverancier, per maand en de
 * grootste prijsafwijkingen. Client-side berekend uit dezelfde twee tabellen
 * als fetchInvoices - bij deze aantallen (facturen, geen orderregels-schaal)
 * is een aparte database-view nog niet nodig. */
export async function fetchAnalytics(schemaName = DEFAULT_SCHEMA) {
  const { data: invoices, error } = await invoicesQuery(schemaName)
    .select('id, supplier, invoice_number, invoice_date, checked')
    .order('invoice_date', { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message || 'Kon facturen niet laden.');

  const { data: lines, error: linesError } = await invoiceLinesQuery(schemaName)
    .select(
      'purchase_invoice_id, purchase_order_number, description, match_status, price_within_tolerance, line_price, source_line_price, price_difference'
    )
    .limit(20000);
  if (linesError) throw new Error(linesError.message || 'Kon factuurregels niet laden.');

  const invoiceById = new Map((invoices || []).map((i) => [i.id, i]));
  const linesByInvoice = new Map();
  for (const line of lines || []) {
    const list = linesByInvoice.get(line.purchase_invoice_id) || [];
    list.push(line);
    linesByInvoice.set(line.purchase_invoice_id, list);
  }

  const perSupplierMap = new Map();
  const byMonthMap = new Map();
  let totalTodo = 0;
  let totalWithPriceIssue = 0;
  let totalOvercharge = 0;

  for (const invoice of invoices || []) {
    const invoiceLines = linesByInvoice.get(invoice.id) || [];
    const status = deriveInvoiceStatus(invoice, invoiceLines);
    const amount = invoiceLines.reduce((sum, l) => sum + (Number(l.line_price) || 0), 0);
    const overcharge = invoiceLines
      .filter((l) => l.match_status === 'matched' && l.price_within_tolerance === false)
      .reduce((sum, l) => sum + Math.max(0, Number(l.price_difference) || 0), 0);

    if (invoice.checked === null || invoice.checked === undefined) totalTodo += 1;
    if (status.key === 'price') totalWithPriceIssue += 1;
    totalOvercharge += overcharge;

    const supplierRow = perSupplierMap.get(invoice.supplier) || {
      supplier: invoice.supplier,
      invoices: 0,
      totalAmount: 0,
      priceIssueInvoices: 0,
      unlinkedInvoices: 0,
      overcharge: 0,
    };
    supplierRow.invoices += 1;
    supplierRow.totalAmount += amount;
    if (status.key === 'price') supplierRow.priceIssueInvoices += 1;
    if (status.key === 'unlinked') supplierRow.unlinkedInvoices += 1;
    supplierRow.overcharge += overcharge;
    perSupplierMap.set(invoice.supplier, supplierRow);

    if (invoice.invoice_date) {
      const month = String(invoice.invoice_date).slice(0, 7);
      const monthRow = byMonthMap.get(month) || { month, invoices: 0, totalAmount: 0 };
      monthRow.invoices += 1;
      monthRow.totalAmount += amount;
      byMonthMap.set(month, monthRow);
    }
  }

  const topOvercharges = (lines || [])
    .filter((l) => l.match_status === 'matched' && l.price_within_tolerance === false)
    .map((l) => {
      const invoice = invoiceById.get(l.purchase_invoice_id);
      return {
        id: `${l.purchase_invoice_id}-${l.purchase_order_number || ''}-${l.description || ''}`,
        invoiceId: l.purchase_invoice_id,
        invoiceNumber: invoice?.invoice_number,
        supplier: invoice?.supplier || '-',
        description: l.description || '-',
        sourceLinePrice: l.source_line_price,
        linePrice: l.line_price,
        priceDifference: Number(l.price_difference) || 0,
      };
    })
    .sort((a, b) => b.priceDifference - a.priceDifference)
    .slice(0, 10);

  return {
    totals: {
      invoices: (invoices || []).length,
      todo: totalTodo,
      withPriceIssue: totalWithPriceIssue,
      overchargeAmount: totalOvercharge,
    },
    perSupplier: Array.from(perSupplierMap.values()).sort((a, b) => b.invoices - a.invoices),
    byMonth: Array.from(byMonthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
    topOvercharges,
  };
}
