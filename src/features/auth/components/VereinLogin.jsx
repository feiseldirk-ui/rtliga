import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import supabase from "../../../lib/supabase/client";
import { logError } from "../../../lib/logger";
import { writeVereinSession } from "../../../lib/storage/vereinSession";

export default function VereinLogin({ onLoginErfolg }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState("");
  const [passwort, setKennwort] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    const presetEmail = (searchParams.get("email") || "").trim().toLowerCase();
    if (presetEmail) {
      setEmail((current) => current || presetEmail);
    }
  }, [searchParams]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setFehler("");
    setLoading(true);

    try {
      const mail = email.trim().toLowerCase();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: mail,
        password: passwort,
      });

      if (error || !data?.user) {
        setFehler("Login fehlgeschlagen. Bitte prüfen Sie Ihre Zugangsdaten.");
        return;
      }

      const { data: verein, error: vereinError } = await supabase
        .from("vereine")
        .select("id, vereinsname")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (vereinError || !verein) {
        await supabase.auth.signOut();
        setFehler("Für dieses Konto wurde kein Verein gefunden.");
        return;
      }

      const safeVerein = {
        id: verein.id,
        vereinsname: verein.vereinsname,
      };

      writeVereinSession(safeVerein);
      onLoginErfolg?.(safeVerein);
      navigate("/verein");
    } catch {
      logError("Login-Vorgang fehlgeschlagen.");
      setFehler("Beim Login ist ein Fehler aufgetreten.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="card w-full max-w-md p-8 animate-fade-in">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-zinc-900">Vereinslogin</h2>
          <button className="btn btn-secondary" onClick={() => navigate("/")}>
            Zurück
          </button>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-zinc-700">
              E-Mail
            </label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="verein@email.de"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="block text-sm font-semibold text-zinc-700">
                Kennwort
              </label>

              <button
                type="button"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set("context", "verein");
                  params.set("back", "/login");
                  if (email.trim()) {
                    params.set("email", email.trim().toLowerCase());
                  }
                  navigate(`/passwort-vergessen?${params.toString()}`);
                }}
              >
                Kennwort vergessen?
              </button>
            </div>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                className="input pr-24"
                value={passwort}
                onChange={(e) => setKennwort(e.target.value)}
                placeholder="Kennwort"
                autoComplete="current-password"
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

          {fehler ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {fehler}
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? "Anmeldung läuft…" : "Einloggen"}
          </button>
        </form>
      </div>
    </div>
  );
}
