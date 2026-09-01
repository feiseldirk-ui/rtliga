import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { logError } from "../../../lib/logger";
import { writeVereinSession } from "../../../lib/storage/vereinSession";
import { loginClub } from "../../../lib/vereinSessionLock";

export default function VereinLogin({ onLoginErfolg }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState("");
  const [passwort, setKennwort] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fehler, setFehler] = useState("");
  const [switchAvailable, setSwitchAvailable] = useState(false);

  useEffect(() => {
    const presetEmail = (searchParams.get("email") || "").trim().toLowerCase();
    if (presetEmail) {
      setEmail((current) => current || presetEmail);
    }
  }, [searchParams]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setFehler("");
    setSwitchAvailable(false);
    setLoading(true);

    try {
      const mail = email.trim().toLowerCase();

      const safeVerein = await loginClub(mail, passwort);

      writeVereinSession(safeVerein);
      onLoginErfolg?.(safeVerein);
      navigate("/verein");
    } catch (error) {
      logError("Login-Vorgang fehlgeschlagen.");
      setFehler(error.message || "Beim Login ist ein Fehler aufgetreten.");
      setSwitchAvailable(error.reason === "different_account" || error.reason === "ended");
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
            <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {fehler}
              {switchAvailable && <button type="button" className="btn btn-secondary mt-3 w-full" onClick={() => {
                window.dispatchEvent(new CustomEvent("rtliga-confirm-account-switch", { detail: { target: "/login" } }));
              }}>Gespeichertes Konto wechseln</button>}
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
