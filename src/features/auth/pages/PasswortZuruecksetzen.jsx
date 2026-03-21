import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../../../lib/supabase/client";

const ADMIN_ACCESS_FLAG_KEY = "rtliga_admin_access_verified";
const ADMIN_LOGOUT_REDIRECT_KEY = "rtliga_admin_logout_redirect";

function appendParams(merged, rawValue) {
  if (!rawValue) return;

  const normalized = String(rawValue)
    .replace(/^#/, "")
    .replace(/^\//, "")
    .trim();

  if (!normalized) return;

  const candidates = [normalized];

  if (normalized.includes("?")) {
    candidates.push(normalized.split("?").slice(1).join("&"));
  }

  if (normalized.includes("#")) {
    candidates.push(...normalized.split("#"));
  }

  for (const candidate of candidates) {
    const compact = candidate
      .replace(/^#/, "")
      .replace(/^\//, "")
      .trim();

    if (!compact || (!compact.includes("=") && !compact.includes("&"))) {
      continue;
    }

    const params = new URLSearchParams(compact);
    for (const [key, value] of params.entries()) {
      if (value) {
        merged.set(key, value);
      }
    }
  }
}

function readAuthParamsFromUrl() {
  const merged = new URLSearchParams();
  const href = window.location.href || "";
  const currentHash = window.location.hash || "";

  appendParams(merged, window.location.search);
  appendParams(merged, currentHash);

  for (const part of href.split("#")) {
    appendParams(merged, part);
  }

  return {
    accessToken: merged.get("access_token") || "",
    refreshToken: merged.get("refresh_token") || "",
    code: merged.get("code") || "",
    type: merged.get("type") || "",
    context: merged.get("context") || "verein",
    email: merged.get("email") || "",
  };
}

function cleanupRecoveryUrl(context, email) {
  const params = new URLSearchParams();

  if (context === "admin" || context === "verein") {
    params.set("context", context);
  }

  if (email) {
    params.set("email", String(email).trim().toLowerCase());
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#/passwort-aendern${suffix}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

export default function KennwortZuruecksetzen() {
  const navigate = useNavigate();
  const [neuesKennwort, setNeuesKennwort] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("loading");
  const [meldung, setMeldung] = useState("");
  const [nextLoginEmail, setNextLoginEmail] = useState("");
  const recoveryParams = useMemo(() => readAuthParamsFromUrl(), []);
  const loginContext = recoveryParams.context === "admin" ? "admin" : "verein";

  const getLoginTarget = (email = "") => {
    const normalizedEmail = String(email || recoveryParams.email || "").trim().toLowerCase();

    if (loginContext === "admin") {
      return normalizedEmail
        ? `/admin?email=${encodeURIComponent(normalizedEmail)}`
        : "/admin";
    }

    return normalizedEmail
      ? `/login?email=${encodeURIComponent(normalizedEmail)}`
      : "/login";
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { accessToken, refreshToken, code, context, email } = recoveryParams;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            throw error;
          }
          cleanupRecoveryUrl(context, email);
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            throw error;
          }
          cleanupRecoveryUrl(context, email);
        }

        let sessionResult = await supabase.auth.getSession();

        if (!sessionResult.data?.session) {
          for (let attempt = 0; attempt < 20; attempt += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 200));
            sessionResult = await supabase.auth.getSession();
            if (sessionResult.data?.session) {
              break;
            }
          }
        }

        const { data, error } = sessionResult;

        if (!mounted) return;

        if (error) {
          setStatus("error");
          setMeldung(error.message || "Die Reset-Sitzung konnte nicht geladen werden.");
          return;
        }

        if (data?.session) {
          setStatus("ready");
          return;
        }

        if (accessToken || code) {
          setStatus("ready");
          return;
        }

        setStatus("error");
        setMeldung("Der Reset-Link ist ungültig oder bereits abgelaufen.");
      } catch (error) {
        if (!mounted) return;
        setStatus("error");
        setMeldung(error?.message || "Die Reset-Sitzung konnte nicht geladen werden.");
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [recoveryParams]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMeldung("");

    if (neuesKennwort.length < 8) {
      setMeldung("Das neue Kennwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    if (neuesKennwort !== wiederholung) {
      setMeldung("Die Passwörter stimmen nicht überein.");
      return;
    }

    const sessionResult = await supabase.auth.getSession();

    if (!sessionResult.data?.session) {
      const { accessToken, refreshToken } = recoveryParams;

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          setStatus("error");
          setMeldung(sessionError.message || "Die Reset-Sitzung konnte nicht geladen werden.");
          return;
        }
      }
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const loginEmail = userData?.user?.email || recoveryParams.email || "";

    if (userError && !loginEmail) {
      setStatus("error");
      setMeldung(userError.message || "Die Reset-Sitzung konnte nicht geladen werden.");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: neuesKennwort,
    });

    if (error) {
      setStatus("error");
      setMeldung(error.message || "Das Kennwort konnte nicht geändert werden.");
      return;
    }

    setNextLoginEmail(loginEmail);

    try {
      window.sessionStorage.removeItem(ADMIN_ACCESS_FLAG_KEY);
      window.sessionStorage.removeItem(ADMIN_LOGOUT_REDIRECT_KEY);
    } catch {
      // noop
    }

    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // noop
    }

    try {
      for (const storage of [window.localStorage, window.sessionStorage]) {
        const keys = Object.keys(storage);
        for (const key of keys) {
          if (key.startsWith("sb-") || key.includes("supabase")) {
            storage.removeItem(key);
          }
        }
      }
    } catch {
      // noop
    }

    setStatus("success");
    setMeldung(
      "Kennwort erfolgreich geändert. Bitte jetzt mit dem neuen Kennwort neu anmelden."
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md animate-fade-in">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-zinc-900">
            Neues Kennwort setzen
          </h2>

          <button
            className="btn btn-secondary"
            onClick={() => navigate(getLoginTarget(nextLoginEmail))}
          >
            Zum Login
          </button>
        </div>

        {status === "loading" && (
          <p className="text-sm text-zinc-600">
            Reset-Sitzung wird geprüft…
          </p>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Neues Kennwort
              </label>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="input pr-24"
                  value={neuesKennwort}
                  onChange={(event) => setNeuesKennwort(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Mindestens 8 Zeichen"
                  required
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500 hover:text-zinc-900"
                >
                  {showPassword ? "Verbergen" : "Anzeigen"}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Kennwort wiederholen
              </label>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="input pr-24"
                  value={wiederholung}
                  onChange={(event) => setWiederholung(event.target.value)}
                  autoComplete="new-password"
                  placeholder="Kennwort wiederholen"
                  required
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500 hover:text-zinc-900"
                >
                  {showPassword ? "Verbergen" : "Anzeigen"}
                </button>
              </div>
            </div>

            {meldung && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {meldung}
              </div>
            )}

            <button className="btn btn-primary w-full" type="submit">
              Kennwort speichern
            </button>
          </form>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {meldung}
            </div>

            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => navigate(getLoginTarget(nextLoginEmail))}
            >
              {loginContext === "admin" ? "Zum Admin-Login" : "Zum Vereinslogin"}
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {meldung}
            </div>

            <button
              type="button"
              className="btn btn-secondary w-full"
              onClick={() => navigate(getLoginTarget(nextLoginEmail))}
            >
              {loginContext === "admin" ? "Zum Admin-Login" : "Zum Vereinslogin"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
