import React, { useEffect, useState } from "react";
import supabase from "../supabaseClient";

const VereineTab = () => {
  const [vereine, setVereine] = useState([]);
  const [offenVereinId, setOffenVereinId] = useState(null);
  const [teilnehmerMap, setTeilnehmerMap] = useState({});

  useEffect(() => {
    fetchVereine();
  }, []);

  const fetchVereine = async () => {
    const { data, error } = await supabase.from("vereine").select("*");
    if (error) {
      console.error("Fehler beim Laden der Vereine:", error);
    } else {
      setVereine(data);
    }
  };

  const toggleTeilnehmer = async (verein_id) => {
    if (offenVereinId === verein_id) {
      setOffenVereinId(null); // zuklappen
    } else {
      setOffenVereinId(verein_id); // neuen öffnen
      if (!teilnehmerMap[verein_id]) {
        const { data, error } = await supabase
          .from("verein_teilnehmer")
          .select("*")
          .eq("verein_id", verein_id);
        if (error) {
          console.error("Fehler beim Laden der Teilnehmer:", error);
        } else {
          setTeilnehmerMap((prev) => ({ ...prev, [verein_id]: data }));
        }
      }
    }
  };

  return (
    <div>
      <h2>Alle Vereine</h2>
      <ul>
        {vereine.map((verein) => (
          <li key={verein.id}>
            <button
              style={{ fontWeight: "bold", cursor: "pointer" }}
              onClick={() => toggleTeilnehmer(verein.id)}
            >
              {verein.vereinsname}
            </button>
            {offenVereinId === verein.id && (
              <table style={{ marginTop: "0.5rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ borderBottom: "1px solid #ccc", padding: "4px" }}>Vorname</th>
                    <th style={{ borderBottom: "1px solid #ccc", padding: "4px" }}>Nachname</th>
                    <th style={{ borderBottom: "1px solid #ccc", padding: "4px" }}>Altersklasse</th>
                  </tr>
                </thead>
                <tbody>
                  {(teilnehmerMap[verein.id] || []).map((t) => (
                    <tr key={t.id}>
                      <td style={{ padding: "4px" }}>{t.vorname}</td>
                      <td style={{ padding: "4px" }}>{t.name}</td>
                      <td style={{ padding: "4px" }}>{t.altersklasse}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default VereineTab;
