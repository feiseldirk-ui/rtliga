import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";

export default function VereinLogin({ onLoginErfolg }) {
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [meldung, setMeldung] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: passwort,
    });

    if (error) {
      setMeldung("Login fehlgeschlagen: " + error.message);
    } else {
      setMeldung("Login erfolgreich!");

      // Vereinsdaten holen und speichern
      const { data: vereinData, error: vereinError } = await supabase
        .from("vereine")
        .select("*")
        .or(`email.eq.${email},benutzername.eq.${email}`)
        .single();

      if (vereinError || !vereinData) {
        setMeldung("Login erfolgreich, aber Verein nicht gefunden.");
        return;
      }

      // Im localStorage ablegen
      localStorage.setItem("verein", JSON.stringify(vereinData));

      if (onLoginErfolg) onLoginErfolg(vereinData);
      navigate("/verein"); // Weiterleitung
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "400px", margin: "auto" }}>
      <h2>Verein Login</h2>
      <button onClick={() => navigate("/")}>Zurück</button>

      <input
        type="email"
        placeholder="E-Mail oder Benutzername"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: "100%", marginBottom: "1rem" }}
      />

      <input
        type="password"
        placeholder="Passwort"
        value={passwort}
        onChange={(e) => setPasswort(e.target.value)}
        style={{ width: "100%", marginBottom: "1rem" }}
      />

      <button onClick={handleLogin} style={{ marginBottom: "1rem" }}>
        Einloggen
      </button>

      <div>
        <a
          href="https://app.supabase.io/auth/reset-password"
          target="_blank"
          rel="noopener noreferrer"
        >
          Passwort vergessen?
        </a>
      </div>

      {meldung && <p style={{ marginTop: "1rem" }}>{meldung}</p>}
    </div>
  );
}
