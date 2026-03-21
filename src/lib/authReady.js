import supabase from "./supabase/client";

const delay = (ms) => new Promise((resolve) => {
  window.setTimeout(resolve, ms);
});

export async function ensureSupabaseSession({ retries = 20, interval = 200 } = {}) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw error;
    }

    if (data?.session) {
      return data.session;
    }

    if (attempt < retries - 1) {
      await delay(interval);
    }
  }

  return null;
}
