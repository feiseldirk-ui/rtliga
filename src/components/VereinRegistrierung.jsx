import React, { useState } from "react";
import supabase from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import bcrypt from "bcryptjs";

export default function VereinRegistrierung() {
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [passwortWdh, setPasswortWdh] = useState("");
  const [vereinsname, setVereinsname] = useState("");
  const [benutzername, setBenutzername] = useState("");
  const [meldung, setMeldung] = useState("");
  const navigate = useNavigate();

  const handleRegistrieren = async () => {
    if (!email || !passwort || !passwortWdh || !vereinsname || !benutzername) {
      setMeldung("Bitte alle Felder ausfüllen.");
      return;
    }

    if (passwort !== passwortWdh) {
      setMeldung("Passwörter stimmen nicht überein.");
      return;
    }

    try {
      const hashedPassword = await bcrypt.hash(passwort, 10);

      // Supabase Auth Registrierung
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: passwort,
      });

      if (signUpError) {
        setMeldung("Fehler bei Registrierung: " + signUpError.message);
        return;
      }

      // Verein in eigene Tabelle eintragen
      const { error: insertError } = await supabase.from("vereine").insert({
        id: signUpData.user.id,
        vereinsname,
        benutzername,
        passwort_hash: hashedPassword,
        email,
      });

      if (insertError) {
        setMeldung("Fehler beim Speichern des Vereins: " + insertError.message);
        return;
      }

      setMeldung("Registrierung erfolgreich! Du wirst weitergeleitet …");
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setMeldung("Unbekannter Fehler: " + err.message);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "400px", margin: "auto" }}>
      <h2>Verein registrieren</h2>

      <button onClick={() => navigate("/")}>Zurück</button>

      <input
        type="text"
        placeholder="Vereinsname"
        value={vereinsname}
        onChange={(e) => setVereinsname(e.target.value)}
        style={{ width: "100%", marginBottom: "1rem" }}
      />
      <input
        type="text"
        placeholder="Benutzername"
        value={benutzername}
        onChange={(e) => setBenutzername(e.target.value)}
        style={{ width: "100%", marginBottom: "1rem" }}
      />
      <input
        type="email"
        placeholder="E-Mail"
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
      <input
        type="password"
        placeholder="Passwort wiederholen"
        value={passwortWdh}
        onChange={(e) => setPasswortWdh(e.target.value)}
        style={{ width: "100%", marginBottom: "1rem" }}
      />

      <button onClick={handleRegistrieren} style={{ marginTop: "1rem" }}>
        Verein jetzt Registrieren
      </button>

      {meldung && <p style={{ marginTop: "1rem", color: "lightgreen" }}>{meldung}</p>}
    </div>
  );
}
