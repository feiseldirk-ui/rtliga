import React, { useState } from "react";
import supabase from "../supabaseClient";

const VereinTeilnehmerTab = ({ teilnehmer, setTeilnehmer, vereinId }) => {
  const [vorname, setVorname] = useState("");
  const [name, setName] = useState("");
  const [altersklasse, setAltersklasse] = useState("Schüler");

  const hinzufuegen = async () => {
    if (!vorname || !name || !vereinId) return;

    const neuerTeilnehmer = {
      vorname,
      name,
      altersklasse,
      verein_id: vereinId,
    };

    const { data, error } = await supabase
      .from("verein_teilnehmer")
      .insert([neuerTeilnehmer])
      .select();

    if (error) {
      console.error("Fehler beim Hinzufügen:", error);
    } else {
      setTeilnehmer([...teilnehmer, ...data]);
      setVorname("");
      setName("");
      setAltersklasse("Schüler");
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: "1rem" }}>Teilnehmerverwaltung</h2>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Vorname"
          value={vorname}
          onChange={(e) => setVorname(e.target.value)}
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
        <select
          value={altersklasse}
          onChange={(e) => setAltersklasse(e.target.value)}
          style={inputStyle}
        >
          <option value="Schüler">Schüler</option>
          <option value="Jugend">Jugend</option>
          <option value="Damen">Damen</option>
          <option value="Herren">Herren</option>
        </select>
        <button onClick={hinzufuegen} style={buttonStyle}>Teilnehmer hinzufügen</button>
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Vorname</th>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Altersklasse</th>
          </tr>
        </thead>
        <tbody>
          {teilnehmer.map((t) => (
            <tr key={t.id}>
              <td style={tdStyle}>{t.vorname}</td>
              <td style={tdStyle}>{t.name}</td>
              <td style={tdStyle}>{t.altersklasse}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Style-Objekte für Klarheit und saubere Spalten
const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: "1rem",
};

const thStyle = {
  border: "1px solid #555",
  padding: "8px",
  textAlign: "left",
  backgroundColor: "#222",
  color: "#fff",
};

const tdStyle = {
  border: "1px solid #555",
  padding: "8px",
  color: "#fff",
};

const inputStyle = {
  padding: "6px",
  borderRadius: "4px",
  border: "1px solid #888",
};

const buttonStyle = {
  padding: "6px 12px",
  backgroundColor: "#333",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
};

export default VereinTeilnehmerTab;
