import React, { useEffect, useState } from "react";
import supabase from "../supabaseClient";

export default function VereinErgebnisseAnzeigen({ verein }) {
  const [ergebnisse, setErgebnisse] = useState([]);

  useEffect(() => {
    if (verein?.vereinsname) fetchErgebnisse();
  }, [verein]);

  const fetchErgebnisse = async () => {
    const { data, error } = await supabase
      .from("verein_ergebnisse")
      .select("*")
      .eq("verein", verein.vereinsname);

    if (!error && data) {
      const gruppiert = gruppiereNachTeilnehmer(data);
      setErgebnisse(gruppiert);
    }
  };

  const gruppiereNachTeilnehmer = (daten) => {
    const gruppiert = {};
    daten.forEach((eintrag) => {
      const schluessel = `${eintrag.vorname} ${eintrag.nachname} ${eintrag.altersklasse}`;
      if (!gruppiert[schluessel]) {
        gruppiert[schluessel] = {
          vorname: eintrag.vorname,
          nachname: eintrag.nachname,
          altersklasse: eintrag.altersklasse,
          punkte: Array(9).fill(0),
        };
      }
      const wkIndex = parseInt(eintrag.ergebnis.match(/WK(\d+)/)?.[1] || 0, 10) - 1;
      const gesamtMatch = eintrag.ergebnis.match(/Gesamt=(\d+)/);
      const gesamt = gesamtMatch ? parseInt(gesamtMatch[1], 10) : 0;
      if (wkIndex >= 0 && wkIndex < 9) {
        gruppiert[schluessel].punkte[wkIndex] = gesamt;
      }
    });
    return Object.values(gruppiert);
  };

  const gruppiertNachAltersklasse = ergebnisse.reduce((acc, eintrag) => {
    if (!acc[eintrag.altersklasse]) acc[eintrag.altersklasse] = [];
    acc[eintrag.altersklasse].push(eintrag);
    return acc;
  }, {});

  const berechneGesamt = (punkte) => {
    const sortiert = [...punkte].sort((a, b) => b - a);
    return sortiert.slice(0, 6).reduce((sum, val) => sum + val, 0);
  };

  const headStyle = {
    border: "1px solid #555",
    padding: "8px",
    background: "#222",
    color: "#fff",
    textAlign: "center",
  };

  const cellStyle = {
    border: "1px solid #555",
    padding: "6px",
    textAlign: "center",
    color: "#fff",
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Gespeicherte Ergebnisse ({verein.vereinsname})</h2>
      {Object.entries(gruppiertNachAltersklasse).map(([klasse, teilnehmerListe]) => (
        <div key={klasse} style={{ marginTop: "3rem" }}>
          <h3 style={{ color: "#fff", marginBottom: "0.5rem" }}>{klasse}</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #444" }}>
            <thead>
              <tr>
                <th style={headStyle}>Vorname</th>
                <th style={headStyle}>Nachname</th>
                <th style={headStyle}>Altersklasse</th>
                {[...Array(9)].map((_, i) => (
                  <th key={i} style={headStyle}>WK{i + 1}</th>
                ))}
                <th style={headStyle}>Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {teilnehmerListe
                .sort((a, b) => berechneGesamt(b.punkte) - berechneGesamt(a.punkte))
                .map((eintrag, idx) => {
                  const sortiert = [...eintrag.punkte].sort((a, b) => a - b);
                  const schlechtesteDrei = new Set(sortiert.slice(0, 3));
                  return (
                    <tr key={idx} style={{ borderTop: "1px solid #444", height: "40px" }}>
                      <td style={cellStyle}>{eintrag.vorname}</td>
                      <td style={cellStyle}>{eintrag.nachname}</td>
                      <td style={cellStyle}>{eintrag.altersklasse}</td>
                      {eintrag.punkte.map((pkt, i) => (
                        <td
                          key={i}
                          style={{
                            ...cellStyle,
                            textDecoration: schlechtesteDrei.has(pkt) ? "line-through" : "none",
                            opacity: schlechtesteDrei.has(pkt) ? 0.5 : 1,
                          }}
                        >
                          {pkt}
                        </td>
                      ))}
                      <td style={{ ...cellStyle, fontWeight: "bold" }}>
                        {berechneGesamt(eintrag.punkte)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
