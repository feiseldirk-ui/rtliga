import React, { useEffect, useState, useRef } from "react";
import supabase from "../supabaseClient";

export default function ZeitfensterTab() {
  const [zeitfenster, setZeitfenster] = useState([]);
  const [hinweis, setHinweis] = useState("");
  const [gespeichert, setGespeichert] = useState(null);
  const jetzt = new Date();

  useEffect(() => {
    fetchZeitfenster();
  }, []);

  const fetchZeitfenster = async () => {
    const { data, error } = await supabase
      .from("zeitfenster")
      .select("*")
      .order("wettkampf", { ascending: true });

    const basis = Array.from({ length: 9 }, (_, i) => ({
      id: i + 1,
      wettkampf: i + 1,
      start: "",
      ende: "",
    }));

    const kombiniert = basis.map((wk) => {
      const dbWert = data?.find((d) => d.wettkampf === wk.wettkampf);
      return dbWert ? { ...wk, ...dbWert } : wk;
    });

    if (error) console.error("Fehler beim Laden:", error);
    else setZeitfenster(kombiniert);
  };

  const aktualisiereZeitfenster = (id, feld, wert) => {
    const aktualisiert = zeitfenster.map((z) =>
      z.id === id ? { ...z, [feld]: wert } : z
    );
    setZeitfenster(aktualisiert);
  };

  const speichereZeitfenster = async (fenster) => {
    if (!fenster.start || !fenster.ende) {
      setHinweis("❌ Bitte Start und Ende ausfüllen");
      return;
    }

    const { data, error: findError } = await supabase
      .from("zeitfenster")
      .select("id")
      .eq("wettkampf", fenster.wettkampf)
      .maybeSingle();

    if (findError) {
      console.error("Fehler beim Suchen:", findError);
      setHinweis("❌ Fehler beim Suchen in der Datenbank");
      return;
    }

    let updateError;

    if (data) {
      ({ error: updateError } = await supabase
        .from("zeitfenster")
        .update({ start: fenster.start, ende: fenster.ende })
        .eq("wettkampf", fenster.wettkampf));
    } else {
      ({ error: updateError } = await supabase
        .from("zeitfenster")
        .insert({ wettkampf: fenster.wettkampf, start: fenster.start, ende: fenster.ende }));
    }

    if (updateError) {
      console.error("Fehler beim Speichern:", updateError);
      setHinweis("❌ Fehler beim Speichern");
    } else {
      setHinweis(`✅ Zeitfenster WK${fenster.wettkampf} gespeichert.`);
      setGespeichert(fenster.wettkampf);
      setTimeout(() => fetchZeitfenster(), 300);
    }

    setTimeout(() => {
      setHinweis("");
      setGespeichert(null);
    }, 2500);
  };

  const istOffen = (startStr, endeStr) => {
    if (!startStr || !endeStr) return false;
    const start = new Date(startStr);
    const ende = new Date(endeStr);
    return jetzt >= start && jetzt <= ende;
  };

  const formatDatum = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const DatumFeld = ({ wert, onChange, label }) => {
    const inputRef = useRef(null);
    const [fokus, setFokus] = useState(false);

    const leer = !wert;

    return (
      <div style={{ position: "relative", minWidth: "200px" }}>
        {leer && !fokus && (
          <div
            onClick={() => {
              setFokus(true);
              inputRef.current && inputRef.current.showPicker();
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
              backgroundColor: "#1f2937",
              borderRadius: "0.25rem",
              border: "1px solid #4b5563",
              cursor: "pointer",
              zIndex: 2,
              fontSize: "0.9rem",
            }}
          >📅 {label} wählen</div>
        )}
        <input
          ref={inputRef}
          type="datetime-local"
          value={wert || ""}
          onChange={(e) => {
            onChange(e.target.value);
            setFokus(false);
          }}
          style={{
            padding: "0.5rem",
            borderRadius: "0.25rem",
            border: "1px solid #4b5563",
            backgroundColor: "#374151",
            color: "#fff",
            width: "100%",
            position: "relative",
            zIndex: 1,
          }}
        />
      </div>
    );
  };

  return (
    <div style={{ margin: "2rem" }}>
      <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem" }}>Zeitfenster verwalten</h2>

      {hinweis && (
        <div style={{ marginBottom: "1rem", color: "#4ade80", backgroundColor: "#1f2937", padding: "1rem", borderRadius: "0.5rem" }}>
          {hinweis}
        </div>
      )}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {zeitfenster.map((z) => {
          const offen = istOffen(z.start, z.ende);
          return (
            <li
              key={z.wettkampf}
              style={{
                backgroundColor: offen ? "#065f46" : "#1f2937",
                padding: "1rem",
                borderRadius: "0.5rem",
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "1.5rem",
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: "white", fontWeight: "bold", width: "50px" }}>WK{z.wettkampf}</span>

              <DatumFeld wert={z.start} onChange={(val) => aktualisiereZeitfenster(z.id, "start", val)} label="Startdatum" />
              <DatumFeld wert={z.ende} onChange={(val) => aktualisiereZeitfenster(z.id, "ende", val)} label="Enddatum" />

              <button
                onClick={() => speichereZeitfenster(z)}
                style={{
                  backgroundColor: gespeichert === z.wettkampf ? "#16a34a" : "#2563eb",
                  color: "white",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.25rem",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Speichern
              </button>

              <div style={{ color: "#d1d5db", fontSize: "0.9rem" }}>
                {z.start && z.ende && `Gespeichert: ${formatDatum(z.start)} – ${formatDatum(z.ende)}`}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}