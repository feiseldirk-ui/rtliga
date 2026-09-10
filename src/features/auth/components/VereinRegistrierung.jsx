import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../../../lib/supabase/client";

export default function VereinRegistrierung() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [passwort, setKennwort] = useState("");
  const [passwortWdh, setKennwortWdh] = useState("");
  const [vereinsname, setVereinsname] = useState("");
  const [benutzername, setBenutzername] = useState("");
  const [loading, setLoading] = useState(false);
  const [meldung, setMeldung] = useState("");
  const [fehler, setFehler] = useState("");

  const handleRegistrieren = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMeldung("");
    setFehler("");

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedVereinsname = vereinsname.trim();
    const trimmedBenutzername = benutzername.trim();

    if (!normalizedEmail || !passwort || !passwortWdh || !trimmedVereinsname || !trimmedBenutzername) {
      setFehler("Bitte alle Felder vollständig ausfüllen.");
      setLoading(false);
      return;
    }

    if (passwort !== passwortWdh) {
      setFehler("Die Passwörter stimmen nicht überein.");
      setLoading(false);
      return;
    }

    if (passwort.length < 8) {
      setFehler("Das Kennwort muss mindestens 8 Zeichen lang sein.");
      setLoading(false);
      return;
    }

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: passwort,
      });

      if (signUpError || !signUpData?.user?.id) {
        console.error("Supabase signUp fehlgeschlagen:", signUpError, signUpData);

        const details = [
          signUpError?.message,
          signUpError?.code ? `Code: ${signUpError.code}` : "",
          signUpError?.status ? `Status: ${signUpError.status}` : "",
        ].filter(Boolean);

        setFehler(
          details.length
            ? `Registrierung fehlgeschlagen: ${details.join(" · ")}`
            : "Die Registrierung konnte nicht abgeschlossen werden. Supabase hat keinen Benutzer zurückgegeben."
        );
        setLoading(false);
        return;
      }

      const vereinPayload = {
        id: signUpData.user.id,
        user_id: signUpData.user.id,
        vereinsname: trimmedVereinsname,
        benutzername: trimmedBenutzername,
        email: normalizedEmail,
      };

      const { error: insertError } = await supabase.from("vereine").insert(vereinPayload);

      if (insertError) {
        console.error("Vereinsdatensatz konnte nicht gespeichert werden:", insertError);
        await supabase.auth.signOut();

        const details = [
          insertError?.message,
          insertError?.code ? `Code: ${insertError.code}` : "",
          insertError?.details ? `Details: ${insertError.details}` : "",
          insertError?.hint ? `Hinweis: ${insertError.hint}` : "",
        ].filter(Boolean);

        setFehler(
          `Das Konto wurde erstellt, aber der Verein konnte nicht gespeichert werden.${details.length ? ` ${details.join(" · ")}` : ""}`
        );
        setLoading(false);
        return;
      }

      setMeldung(
        "Registrierung erfolgreich. Sie können sich jetzt mit Ihrer Vereins-E-Mail anmelden."
      );
      setTimeout(() => navigate("/login"), 1600);
    } catch (error) {
      console.error("Unerwarteter Registrierungsfehler:", error);
      setFehler(
        `Bei der Registrierung ist ein unerwarteter Fehler aufgetreten.${error?.message ? ` ${error.message}` : ""}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-8 sm:px-6 lg:px-8">
      <div className="card w-full max-w-md animate-fade-in p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-zinc-900">Verein registrieren</h2>
          <button className="btn btn-secondary" onClick={() => navigate("/")}>
            Zurück
          </button>
        </div>

        <form onSubmit={handleRegistrieren} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Vereinsname
            </label>
            <input
              type="text"
              placeholder="Vereinsname"
              value={vereinsname}
              onChange={(event) => setVereinsname(event.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Benutzername
            </label>
            <input
              type="text"
              placeholder="Benutzername"
              value={benutzername}
              onChange={(event) => setBenutzername(event.target.value)}
              className="input"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">E-Mail</label>
            <input
              type="email"
              placeholder="verein@email.de"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Kennwort
            </label>
            <input
              type="password"
              placeholder="Kennwort"
              value={passwort}
              onChange={(event) => setKennwort(event.target.value)}
              className="input"
              autoComplete="new-password"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Kennwort wiederholen
            </label>
            <input
              type="password"
              placeholder="Kennwort wiederholen"
              value={passwortWdh}
              onChange={(event) => setKennwortWdh(event.target.value)}
              className="input"
              autoComplete="new-password"
              required
            />
          </div>

          {meldung ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {meldung}
            </div>
          ) : null}

          {fehler ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {fehler}
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? "Registrierung läuft…" : "Verein jetzt registrieren"}
          </button>
        </form>
      </div>
    </div>
  );
}
