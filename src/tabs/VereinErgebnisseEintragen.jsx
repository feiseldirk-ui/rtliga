import React, { useEffect, useState } from "react";
import supabase from "../supabaseClient";

export default function VereinErgebnisseEintragen({ onBack, verein }) {
  const [teilnehmer, setTeilnehmer] = useState([]);
  const [zeitfenster, setZeitfenster] = useState([]);
  const [hinweis, setHinweis] = useState("");
  const [offenIndex, setOffenIndex] = useState(null);
  const [dirtyIndex, setDirtyIndex] = useState(null);

  useEffect(() => {
    if (verein?.id) {
      fetchTeilnehmer();
      fetchZeitfenster();
    }
  }, [verein]);

  const fetchTeilnehmer = async () => {
    const { data: teilnehmerData, error: teilnehmerError } = await supabase
      .from("verein_teilnehmer")
      .select("*")
      .eq("verein_id", verein.id);

    const { data: ergebnisseData } = await supabase
      .from("verein_ergebnisse")
      .select("*")
      .eq("verein", verein.vereinsname);

    if (teilnehmerError) {
      console.error("Fehler beim Laden:", teilnehmerError);
    } else {
      const vorbereitet = teilnehmerData.map((t) => {
        const ergebnisse = Array.from({ length: 9 }, (_, i) => {
          const eintrag = ergebnisseData?.find(
            (e) =>
              e.vorname === t.vorname &&
              e.nachname === t.name &&
              e.altersklasse === t.altersklasse &&
              e.wettkampf === i + 1
          );
          if (!eintrag) {
            return { ll: "", sl: "", gesamt: 0, status: "" };
          }
          const [ll, sl, gesamt, status] = [
            eintrag.ergebnis.match(/LL=(\d+)/)?.[1],
            eintrag.ergebnis.match(/SL=(\d+)/)?.[1],
            eintrag.ergebnis.match(/Gesamt=(\d+)/)?.[1],
            eintrag.ergebnis.match(/Status=(.*)/)?.[1],
          ];
          return {
            ll: ll || "",
            sl: sl || "",
            gesamt: parseInt(gesamt || "0", 10),
            status: status || "",
          };
        });
        return { ...t, ergebnisse };
      });
      setTeilnehmer(vorbereitet);
    }
  };

  const fetchZeitfenster = async () => {
    const { data, error } = await supabase
      .from("zeitfenster")
      .select("*")
      .order("wettkampf", { ascending: true });

    if (error) console.error("Fehler beim Laden der Zeitfenster:", error);
    else setZeitfenster(data);
  };

  const toggleErgebnisse = (index) => {
    if (dirtyIndex !== null && dirtyIndex !== index) {
      setHinweis("Bitte zuerst Ergebnisse speichern oder Änderungen verwerfen.");
      return;
    }
    setOffenIndex((prevIndex) => (prevIndex === index ? null : index));
    setHinweis("");
  };

  const handleInputChange = (tidx, wkidx, field, value) => {
    if (!/^[0-9]*$/.test(value)) return;
    setDirtyIndex(tidx);
    setTeilnehmer((prev) => {
      const copy = [...prev];
      const eintrag = {
        ...copy[tidx].ergebnisse[wkidx],
        [field]: value,
      };
      const ll = parseInt(eintrag.ll || 0, 10);
      const sl = parseInt(eintrag.sl || 0, 10);
      eintrag.gesamt = ll + sl;
      copy[tidx].ergebnisse[wkidx] = eintrag;
      return copy;
    });
  };

  const handleStatusChange = (tidx, wkidx, value) => {
    setDirtyIndex(tidx);
    setTeilnehmer((prev) => {
      const copy = [...prev];
      copy[tidx].ergebnisse[wkidx].status = value;
      return copy;
    });
  };

  const handleSave = async (tidx) => {
    const t = teilnehmer[tidx];
    for (let wkidx = 0; wkidx < t.ergebnisse.length; wkidx++) {
      const wk = t.ergebnisse[wkidx];
      const { error } = await supabase
        .from("verein_ergebnisse")
        .upsert({
          verein: verein.vereinsname,
          vorname: t.vorname,
          nachname: t.name,
          altersklasse: t.altersklasse,
          wettkampf: wkidx + 1,
          ergebnis: `WK${wkidx + 1}: LL=${wk.ll}, SL=${wk.sl}, Gesamt=${wk.gesamt}, Status=${wk.status}`,
        }, { onConflict: ["verein", "vorname", "nachname", "altersklasse", "wettkampf"] });

      if (error) {
        console.error("Fehler beim Speichern:", error);
        setHinweis("Fehler beim Speichern der Ergebnisse.");
        return;
      }
    }
    setDirtyIndex(null);
    setHinweis("Ergebnisse gespeichert.");
    setTimeout(() => setHinweis(""), 3000);
  };

  const getWettkampfStatus = (wkIndex) => {
    const z = zeitfenster.find((zf) => zf.wettkampf === wkIndex + 1);
    if (!z) return { status: "Kein Fenster", farbe: "#6c757d" };
    const now = new Date();
    const start = new Date(z.start);
    const end = new Date(z.ende);
    if (now < start) return { status: `Bald\n${z.start.split("T")[0]}`, farbe: "#007bff" };
    if (now > end) return { status: `Zu\n${z.start.split("T")[0]}`, farbe: "#dc3545" };
    return { status: `Offen\n${z.start.split("T")[0]}`, farbe: "#28a745" };
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1100px", margin: "auto" }}>
      <button
        onClick={onBack}
        style={{ background: "#2a2a2a", border: "1px solid #666", color: "#fff", padding: "8px 14px", cursor: "pointer", marginBottom: "2rem" }}
      >
        ← Zurück
      </button>

      <h2 style={{ marginBottom: "1rem" }}>Ergebnisse eintragen</h2>
      <div style={{ marginBottom: "1.5rem" }}>
        <strong>Hinweis:</strong> Eintragungen sind nur während geöffneter Zeitfenster möglich.
      </div>

      {hinweis && (
        <div style={{ background: "#1e4620", color: "#bfffcf", padding: "0.5rem 1rem", border: "1px solid #335533", borderRadius: "5px", marginBottom: "1rem" }}>
          {hinweis}
        </div>
      )}

      {teilnehmer.map((t, tidx) => (
        <div key={t.id} style={{ background: "#1b1b1b", border: "1px solid #444", padding: "1rem", marginBottom: "2rem" }}>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "1rem" }}>
            {[t.vorname, t.name, t.altersklasse].map((info) => (
              <div key={info} style={{ border: "1px solid #555", padding: "8px 14px", minWidth: "120px", background: "#222", color: "#eee", textAlign: "center" }}>{info}</div>
            ))}
            <button
              style={{ background: "#2a2a2a", border: "1px solid #fff", color: "#fff", padding: "8px 14px" }}
              onClick={() => toggleErgebnisse(tidx)}
              disabled={dirtyIndex !== null && dirtyIndex !== tidx}
            >
              {offenIndex === tidx ? "Einklappen" : "Eintragen"}
            </button>
          </div>

          {offenIndex === tidx && (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center" }}>
                <thead>
                  <tr>
                    {["WK", "LL", "SL", "Gesamt", "Status"].map((h) => (
                      <th key={h} style={{ border: "1px solid #555", padding: "6px", background: "#222" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.ergebnisse.map((wk, wkidx) => {
                    const status = getWettkampfStatus(wkidx);
                    const istOffen = status.farbe === "#28a745";
                    return (
                      <tr key={wkidx}>
                        <td style={{ border: "1px solid #555", background: "#111" }}>WK{wkidx + 1}</td>
                        {["ll", "sl"].map((field) => (
                          <td key={field} style={{ border: "1px solid #555" }}>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={wk[field]}
                              onChange={(e) => handleInputChange(tidx, wkidx, field, e.target.value)}
                              style={{ width: "70px", textAlign: "right", background: "#222", color: "#fff", border: "1px solid #555", padding: "4px" }}
                              disabled={!istOffen}
                            />
                          </td>
                        ))}
                        <td style={{ border: "1px solid #555" }}>{wk.gesamt}</td>
                        <td style={{ border: "1px solid #555" }}>
                          <div style={{ padding: "6px", backgroundColor: status.farbe, color: "#fff", borderRadius: "6px", fontWeight: "bold" }}>
                            {status.status.split("\n")[0]}
                            <div style={{ fontSize: "0.8rem" }}>{status.status.split("\n")[1]}</div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: "1rem" }}>
                <button style={{ background: "#2a2a2a", border: "1px solid #666", color: "#fff", padding: "8px 14px" }} onClick={() => handleSave(tidx)}>
                  Ergebnisse speichern
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
