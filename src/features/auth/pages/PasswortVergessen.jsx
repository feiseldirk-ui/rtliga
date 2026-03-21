import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import supabase from "../../../lib/supabase/client";

function getResetRedirectUrl(context, email) {
  const params = new URLSearchParams();
  params.set("context", context === "admin" ? "admin" : "verein");

  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (normalizedEmail) {
    params.set("email", normalizedEmail);
  }

  const basePath = `${window.location.origin}${window.location.pathname}`;
  return `${basePath}#/passwort-aendern?${params.toString()}`;
}

export default function KennwortVergessen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get("email") || "";
  const context = searchParams.get("context") || "verein";
  const backTarget = searchParams.get("back") || (context === "admin" ? "/admin" : "/login");
  const [email, setEmail] = useState(initialEmail);
  const normalizedEmail = email.trim().toLowerCase();

  const redirectTo = useMemo(
    () => getResetRedirectUrl(context, normalizedEmail),
    [context, normalizedEmail]
  );
  const loginTarget = useMemo(() => {
    if (context === "admin") {
      return normalizedEmail
        ? `/admin?email=${encodeURIComponent(normalizedEmail)}`
        : "/admin";
    }

    return normalizedEmail
      ? `/login?email=${encodeURIComponent(normalizedEmail)}`
      : "/login";
  }, [context, normalizedEmail]);
  const [loading, setLoading] = useState(false);
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");
  const [versendet, setVersendet] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMeldung("");
    setFehler("");
    setVersendet(false);

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });

    if (error) {
      setFehler(error.message || "Die Reset-Mail konnte nicht gesendet werden.");
    } else {
      setVersendet(true);
      setMeldung(
        context === "admin"
          ? "Falls ein Adminkonto zu dieser Adresse existiert, wurde eine E-Mail zum Zurücksetzen versendet."
          : "Falls ein Vereinskonto zu dieser Adresse existiert, wurde eine E-Mail zum Zurücksetzen versendet."
      );
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-md animate-fade-in">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-zinc-900">Kennwort vergessen</h2>
          <button className="btn btn-secondary" onClick={() => navigate(backTarget)}>
            Zurück
          </button>
        </div>

        <p className="mb-4 text-sm text-zinc-600">
          {context === "admin"
            ? "Geben Sie die E-Mail-Adresse Ihres Adminkontos ein. Sie erhalten einen Link zum Festlegen eines neuen Kennworts."
            : "Geben Sie die E-Mail-Adresse Ihres Vereinskontos ein. Sie erhalten einen Link zum Festlegen eines neuen Kennworts."}
        </p>

        {versendet ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <p>{meldung}</p>
              <p>Die Reset-Mail wird über Supabase Auth von der dort konfigurierten Absenderadresse versendet.</p>
              <p>Bitte prüfen Sie zusätzlich den Spam- oder Junk-Ordner.</p>
            </div>

            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => navigate(loginTarget)}
            >
              {context === "admin" ? "Zum Admin-Login" : "Zum Vereinslogin"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                E-Mail-Adresse
              </label>
              <input
                type="email"
                className="input"
                placeholder={context === "admin" ? "admin@email.de" : "verein@email.de"}
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {fehler ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {fehler}
              </div>
            ) : null}

            <button className="btn btn-primary w-full" type="submit" disabled={loading}>
              {loading ? "Wird gesendet…" : "Reset-Link senden"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
