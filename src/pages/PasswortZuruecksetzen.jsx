import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
const PasswortZuruecksetzen = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [neuesPasswort, setNeuesPasswort] = useState("");
  const [erfolg, setErfolg] = useState(false);
  const [fehler, setFehler] = useState("");

  useEffect(() => {
    const type = searchParams.get("type");
    if (type !== "recovery") {
      navigate("/"); // unzulässiger Aufruf
    }
  }, [searchParams, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({
      password: neuesPasswort,
    });
    if (error) {
      setFehler(error.message);
    } else {
      setErfolg(true);
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "400px", margin: "auto" }}>
      <h2>Passwort zurücksetzen</h2>
      {erfolg ? (
        <p>
          ✅ Passwort wurde erfolgreich geändert. Du kannst dich jetzt
          einloggen.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Neues Passwort"
            value={neuesPasswort}
            onChange={(e) => setNeuesPasswort(e.target.value)}
            required
            style={{ width: "100%", marginBottom: "1rem" }}
          />
          <button type="submit">Speichern</button>
        </form>
      )}
      {fehler && <p style={{ color: "red" }}>{fehler}</p>}
    </div>
  );
};

export default PasswortZuruecksetzen;
