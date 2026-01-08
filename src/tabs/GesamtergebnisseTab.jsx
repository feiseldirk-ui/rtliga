import React, { useEffect, useState } from "react";
import supabase from "../supabaseClient";

export default function GesamtergebnisseTab() {
  const [alleErgebnisse, setAlleErgebnisse] = useState([]);
  const [zeitfenster, setZeitfenster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const ladeDaten = async () => {
      try {
        const { data: zfData, error: zfError } = await supabase
          .from("zeitfenster")
          .select("wettkampf, start, ende");
        if (zfError) throw zfError;
        setZeitfenster(zfData);

        const { data: ergData, error: ergError } = await supabase
          .from("verein_ergebnisse")
          .select("*");
        if (ergError) throw ergError;
        setAlleErgebnisse(ergData);
      } catch (err) {
        console.error("Fehler beim Laden:", err);
        setError("Fehler beim Laden der Daten");
      } finally {
        setLoading(false);
      }
    };

    ladeDaten();
  }, []);

  const jetzt = new Date().getTime();
  const geschlosseneWks = zeitfenster
    .filter((z) => Date.parse(z.ende) < jetzt)
    .map((z) => Number(z.wettkampf));

  const gruppiert = {};

  alleErgebnisse
    .filter((e) => geschlosseneWks.includes(e.wettkampf))
    .forEach((e) => {
      const key = `${e.vorname}_${e.nachname}_${e.altersklasse}_${e.verein}`;
      if (!gruppiert[key]) {
        gruppiert[key] = {
          vorname: e.vorname,
          nachname: e.nachname,
          verein: e.verein,
          altersklasse: e.altersklasse,
          punkte: {},
          besteWks: [],
          gesamt: 0,
        };
      }

      let wert = 0;
      if (e.ergebnis) {
        const match = e.ergebnis.match(/Gesamt\s*=\s*(\d+)/i);
        if (match && match[1]) {
          wert = parseInt(match[1], 10);
        }
      }
      gruppiert[key].punkte[`WK${e.wettkampf}`] = wert;
    });

  Object.values(gruppiert).forEach((person) => {
    const entries = Object.entries(person.punkte)
      .filter(([wk]) =>
        geschlosseneWks.includes(Number(wk.replace("WK", "")))
      );

    entries.sort(([, a], [, b]) => b - a);

    person.besteWks = entries.slice(0, 6).map(([wk]) => wk);
    person.gesamt = entries
      .slice(0, 6)
      .reduce((sum, [, val]) => sum + val, 0);
  });

  const nachAltersklasse = {};
  Object.values(gruppiert).forEach((p) => {
    if (!nachAltersklasse[p.altersklasse]) {
      nachAltersklasse[p.altersklasse] = [];
    }
    nachAltersklasse[p.altersklasse].push(p);
  });

  if (loading) return <p>Lade Ergebnisse…</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ padding: "1rem" }}>
      <h2>Gesamtergebnisse (nur geschlossene Zeitfenster)</h2>
      <p style={{ color: "orange" }}>
        ⚠ Es werden nur Ergebnisse mit geschlossenem Zeitfenster angezeigt
      </p>

      {Object.keys(nachAltersklasse).length === 0 && (
        <p>Keine geschlossenen Ergebnisse vorhanden.</p>
      )}

      {Object.entries(nachAltersklasse).map(([klasse, liste]) => (
        <div key={klasse} style={{ marginTop: "1.5rem" }}>
          <h3>{klasse}</h3>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: "0.5rem",
            }}
          >
            <thead>
              <tr>
                <th style={{ border: "1px solid #444", padding: "6px" }}>
                  Vorname
                </th>
                <th style={{ border: "1px solid #444", padding: "6px" }}>
                  Nachname
                </th>
                <th style={{ border: "1px solid #444", padding: "6px" }}>
                  Verein
                </th>
                {[...Array(9)].map((_, i) => (
                  <th
                    key={i}
                    style={{ border: "1px solid #444", padding: "6px" }}
                  >
                    WK{i + 1}
                  </th>
                ))}
                <th style={{ border: "1px solid #444", padding: "6px" }}>
                  Gesamt
                </th>
              </tr>
            </thead>
            <tbody>
              {liste
                .sort((a, b) => b.gesamt - a.gesamt)
                .map((p, idx) => (
                  <tr key={idx}>
                    <td style={{ border: "1px solid #444", padding: "6px" }}>
                      {p.vorname}
                    </td>
                    <td style={{ border: "1px solid #444", padding: "6px" }}>
                      {p.nachname}
                    </td>
                    <td style={{ border: "1px solid #444", padding: "6px" }}>
                      {p.verein}
                    </td>
                    {[...Array(9)].map((_, i) => {
                      const wkKey = `WK${i + 1}`;
                      const wert = geschlosseneWks.includes(i + 1)
                        ? p.punkte[wkKey]
                        : "";

                      const istSchlechter = wert !== undefined && !p.besteWks.includes(wkKey);

                      return (
                        <td
                          key={i}
                          style={{
                            border: "1px solid #444",
                            padding: "6px",
                            color: istSchlechter ? "#888" : "inherit",
                            textDecoration: istSchlechter
                              ? "line-through"
                              : "none",
                          }}
                        >
                          {wert ?? ""}
                        </td>
                      );
                    })}
                    <td
                      style={{
                        border: "1px solid #444",
                        padding: "6px",
                        fontWeight: "bold",
                      }}
                    >
                      {p.gesamt}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
