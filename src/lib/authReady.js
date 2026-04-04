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

/**
 * Wartet zuverlässig auf eine aktive Supabase-Session.
 * Kombiniert sofortige Prüfung, onAuthStateChange und Polling.
 * Gibt die Session zurück oder null.
 */
export function waitForSession(timeoutMs = 4000) {
  return new Promise((resolve) => {
    let settled = false;
    let unsub = null;
    let timer = null;

    const settle = (session) => {
      if (settled) return;
      settled = true;
      if (unsub) { try { unsub(); } catch {} }
      if (timer) clearTimeout(timer);
      resolve(session || null);
    };

    timer = setTimeout(() => settle(null), timeoutMs);

    // Sofortiger Check
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) { settle(data.session); return; }

      // Auth-State-Change Listener
      const { data: authData } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) settle(session);
      });
      unsub = () => authData?.subscription?.unsubscribe?.();

      // Polling als Fallback (Supabase feuert onAuthStateChange nicht immer)
      const poll = async () => {
        for (let i = 0; i < 10 && !settled; i++) {
          await delay(250);
          if (settled) return;
          const { data: d } = await supabase.auth.getSession().catch(() => ({ data: null }));
          if (d?.session) { settle(d.session); return; }
        }
        settle(null);
      };
      poll();
    }).catch(() => settle(null));
  });
}
