import supabase from './supabase/client';
import { createAdminSessionApi, createAdminLogin, ADMIN_SESSION_KEY } from './adminSessionCore';
export const adminSessionApi = createAdminSessionApi(supabase);
export const adminLogin = createAdminLogin(supabase, adminSessionApi);
export function readAdminIdentity() {
  try { return sessionStorage.getItem(ADMIN_SESSION_KEY); } catch { return null; }
}
export function writeAdminIdentity(identity) {
  if (identity) sessionStorage.setItem(ADMIN_SESSION_KEY,identity);
  else sessionStorage.removeItem(ADMIN_SESSION_KEY);
}
