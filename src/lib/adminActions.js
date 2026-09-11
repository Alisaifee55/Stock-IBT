import { supabase } from './supabaseClient';

/** Admin: create a new shop + its login account in one call. */
export async function adminCreateShop(code, name, country, password) {
  const { data, error } = await supabase.rpc('admin_create_shop', {
    p_code: code,
    p_name: name,
    p_country: country,
    p_password: password,
  });
  return { data, error };
}

/** Admin: reset any shop's password. */
export async function adminSetShopPassword(shopCode, newPassword) {
  const { error } = await supabase.rpc('admin_set_shop_password', {
    p_shop_code: shopCode,
    p_new_password: newPassword,
  });
  return { error };
}

/** Self-service: the currently logged-in account changes its own password. */
export async function changeMyPassword(newPassword) {
  const { error } = await supabase.rpc('change_my_password', { p_new_password: newPassword });
  return { error };
}
