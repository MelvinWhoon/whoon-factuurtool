import { TENANTS_TABLE_NAME, TENANTS_TABLE_SCHEMA, TENANTS_USER_ID_COLUMN } from './config';
import { supabase } from './supabaseClient';

function tenantsQuery() {
  return supabase.schema(TENANTS_TABLE_SCHEMA).from(TENANTS_TABLE_NAME);
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
