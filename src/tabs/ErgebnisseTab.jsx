import React, { useEffect, useState } from "react";
import supabase from "../supabaseClient";

const tableStyle = {
  borderCollapse: "collapse",
  width: "100%",
  marginTop: "1rem",
  fontSize: "0.95rem",
  color: "#f5f5f5",
};

const thStyle = {
  border: "1px solid #555",
  backgroundColor: "#222",
  padding: "6px",
  textAlign: "center",
  color: "#fff",
};

const tdStyle = {
  border: "1px solid #444",
  padding: "6px",
  textAlign: "center",
};

const ErgebnisseTab = () => {
  const [gruppierteErgebnisse, setGruppierteErgebnisse] = useState({});

  useEffect(() => {
    ladeUndVerarbeiteErgebnisse();
  }, []);

  const ladeUndVerarbeiteErgebnisse = async () => {
    const { data, error } = await supabase.from("verein_ergebnisse").select("*");
    if (error) {
      console.error("Fehler beim Laden:", error);
      return;
    }

    const teilnehmerMap = {};

    data.forEach((eintrag) => {
      const key = `${eintrag.vorname} ${eintrag.nachname} ${eintrag.altersklasse}`;
      if (!teilnehmerMap[key]) {
        teilnehmerMap[key] = {
          vorname: eintrag.vorname,
          nachname: eintrag.nachname,
          altersklasse: eintrag.altersklasse,
          verein: eintrag.verein,
          punkte: Array(9).fill(0),
        };
      }

      const wkIndex = parseInt(eintrag.ergebnis.match(/WK(\d+)/)?.[1], 10) - 1;
      const gesamt = parseInt(eintrag.ergebnis.match(/Gesamt=(\d+)/)?.[1], 10);
      if (!isNaN(wkIndex) && !isNaN(gesamt)) {
        teilnehmerMap[key].punkte[wkIndex] = gesamt;
      }
    });

    const teilnehmerListe = Object.values(teilnehmerMap);

    const gruppiert = {};
    teilnehmerListe.forEach((t) => {
      if (!gruppiert[t.altersklasse]) {
        gruppiert[t.altersklasse] = [];
      }
      gruppiert[t.altersklasse].push({
        ...t,
        gesamt: berechneBeste6(t.punkte).summe,
        streicher: berechneBeste6(t.punkte).streicher,
      });
    });

    Object.keys(gruppiert).forEach((klasse) => {
      gruppiert[klasse].sort((a, b) => b.gesamt - a.gesamt);
    });

    setGruppierteErgebnisse(gruppiert);
  };

  const berechneBeste6 = (punkte) => {
    const sortiert = [...punkte].sort((a, b) => b - a);
    const summe = sortiert.slice(0, 6).reduce((acc, val) => acc + val, 0);
    const streicher = [...punkte]
      .map((val, idx) => ({ val, idx }))
      .sort((a, b) => a.val - b.val)
      .slice(0, 3)
      .map((e) => e.idx);
    return { summe, streicher };
  };

  return (
    <div>
      <h2 style={{ color: "#f5f5f5" }}>Alle Ergebnisse (Beste 6 zählen)</h2>
      {Object.entries(gruppierteErgebnisse).map(([klasse, teilnehmer]) => (
        <div key={klasse} style={{ marginBottom: "3rem" }}>
          <h3 style={{ borderBottom: "2px solid #999", paddingBottom: "4px", color: "#f5f5f5" }}>{klasse}</h3>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Vorname</th>
                <th style={thStyle}>Nachname</th>
                <th style={thStyle}>Verein</th>
                {[...Array(9)].map((_, i) => (
                  <th key={i} style={thStyle}>WK{i + 1}</th>
                ))}
                <th style={thStyle}>Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {teilnehmer.map((t, idx) => (
                <tr key={idx}>
                  <td style={tdStyle}>{t.vorname}</td>
                  <td style={tdStyle}>{t.nachname}</td>
                  <td style={tdStyle}>{t.verein}</td>
                  {t.punkte.map((pkt, i) => (
                    <td
                      key={i}
                      style={{
                        ...tdStyle,
                        textDecoration: t.streicher.includes(i) ? "line-through" : "none",
                        opacity: t.streicher.includes(i) ? 0.4 : 1,
                        color: t.streicher.includes(i) ? "#888" : "#f5f5f5",
                      }}
                    >
                      {pkt > 0 ? pkt : ""}
                    </td>
                  ))}
                  <td style={{ ...tdStyle, fontWeight: "bold", color: "#fff" }}>{t.gesamt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

export default ErgebnisseTab;
