import React, { useEffect, useState } from "react";
import supabase from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import VereinErgebnisseEintragen from "./VereinErgebnisseEintragen";
import VereinErgebnisseAnzeigen from "./VereinErgebnisseAnzeigen";

const ALTERSklassen = ["Schüler", "Jugend", "Damen", "Herren"];

const initialForm = {
  vorname: "",
  name: "",
  altersklasse: "Schüler",
};

export default function VereinStart() {
  const [verein, setVerein] = useState(null);
  const [teilnehmer, setTeilnehmer] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [bearbeiteId, setBearbeiteId] = useState(null);
  const [activeTab, setActiveTab] = useState("teilnehmer");
  const [hinweis, setHinweis] = useState("");
  const [loeschWarnung, setLoeschWarnung] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    const lade = async () => {
      const gespeicherterVerein = localStorage.getItem("verein");
      if (gespeicherterVerein) {
        const v = JSON.parse(gespeicherterVerein);
        setVerein(v);
        fetchTeilnehmer(v.id);
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        navigate("/login");
        return;
      }

      const { data: vereinData } = await supabase
        .from("vereine")
        .select("*")
        .or(`email.eq.${user.email},benutzername.eq.${user.email}`)
        .maybeSingle();

      if (vereinData) {
        setVerein(vereinData);
        fetchTeilnehmer(vereinData.id);
      }
    };

    lade();
  }, []);

  const hatErgebnisse = async (vorname, nachname) => {
    const { data } = await supabase
      .from("verein_ergebnisse")
      .select("id")
      .eq("vorname", vorname)
      .eq("nachname", nachname);

    return data && data.length > 0;
  };

  const fetchTeilnehmer = async (vereinId) => {
    const { data } = await supabase
      .from("verein_teilnehmer")
      .select("*")
      .eq("verein_id", vereinId);

    const datenMitErgebnisInfo = await Promise.all(
      data.map(async (t) => {
        const hat = await hatErgebnisse(t.vorname, t.name);
        return { ...t, hatErgebnisse: hat };
      })
    );

    setTeilnehmer(datenMitErgebnisInfo);
  };

  const handleChangeForm = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAddTeilnehmer = async () => {
    if (!verein) return;
    const { error } = await supabase.from("verein_teilnehmer").insert({
      vorname: form.vorname,
      name: form.name,
      altersklasse: form.altersklasse,
      verein_id: verein.id,
    });

    if (!error) {
      setHinweis("Teilnehmer hinzugefügt.");
      setForm(initialForm);
      fetchTeilnehmer(verein.id);
      setTimeout(() => setHinweis(""), 3000);
    }
  };

  const startEdit = (t) => {
    setBearbeiteId(t.id);
    setForm({
      vorname: t.vorname,
      name: t.name,
      altersklasse: t.altersklasse,
    });
  };

  const handleUpdate = async (id) => {
    const { error } = await supabase
      .from("verein_teilnehmer")
      .update({
        vorname: form.vorname,
        name: form.name,
        altersklasse: form.altersklasse,
      })
      .eq("id", id);

    if (!error) {
      setBearbeiteId(null);
      setForm(initialForm);
      fetchTeilnehmer(verein.id);
      setHinweis("Änderungen wurden gespeichert.");
      setTimeout(() => setHinweis(""), 3000);
    }
  };

  const confirmDelete = (id) => {
    setLoeschWarnung(id);
  };

  const performDelete = async (id) => {
    const { error } = await supabase
      .from("verein_teilnehmer")
      .delete()
      .eq("id", id);

    if (!error) {
      setLoeschWarnung(null);
      fetchTeilnehmer(verein.id);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("verein");
    navigate("/login");
  };

  return (
    <div style={{ padding: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>
          Verein: {verein ? `– ${verein.vereinsname}` : "– Teilnehmerverwaltung"}
        </h2>
        <button onClick={handleLogout}>Logout</button>
      </div>

      <div style={{ display: "flex", gap: "1rem", margin: "1rem 0" }}>
        <button onClick={() => setActiveTab("teilnehmer")}>Teilnehmer</button>
        <button onClick={() => setActiveTab("ergebnisse")}>Ergebnisse eintragen</button>
        <button onClick={() => setActiveTab("meineErgebnisse")}>Meine Ergebnisse</button>
      </div>

      {activeTab === "teilnehmer" && (
        <>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <input
              name="vorname"
              placeholder="Vorname"
              value={form.vorname}
              onChange={handleChangeForm}
            />
            <input
              name="name"
              placeholder="Name"
              value={form.name}
              onChange={handleChangeForm}
            />
            <select
              name="altersklasse"
              value={form.altersklasse}
              onChange={handleChangeForm}
            >
              {ALTERSklassen.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
            <button onClick={handleAddTeilnehmer}>Teilnehmer hinzufügen</button>
          </div>

          {hinweis && <p style={{ color: "green", marginBottom: "0.5rem" }}>{hinweis}</p>}

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Vorname</th>
                <th>Name</th>
                <th>Altersklasse</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {teilnehmer.map((t) => (
                <tr key={t.id}>
                  {bearbeiteId === t.id ? (
                    <>
                      <td>
                        <input
                          name="vorname"
                          value={form.vorname}
                          onChange={handleChangeForm}
                        />
                      </td>
                      <td>
                        <input
                          name="name"
                          value={form.name}
                          onChange={handleChangeForm}
                        />
                      </td>
                      <td>
                        <select
                          name="altersklasse"
                          value={form.altersklasse}
                          onChange={handleChangeForm}
                        >
                          {ALTERSklassen.map((a) => (
                            <option key={a}>{a}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button onClick={() => handleUpdate(t.id)}>💾</button>
                        <button
                          onClick={() => {
                            setBearbeiteId(null);
                            setForm(initialForm);
                          }}
                        >
                          ✖️
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{t.vorname}</td>
                      <td>{t.name}</td>
                      <td>{t.altersklasse}</td>
                      <td style={{ verticalAlign: "middle", display: "flex", flexDirection: "column", alignItems: "start", gap: "0.25rem" }}>

                        {t.hatErgebnisse ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "gray" }}>
                            <span style={{ fontSize: "1.2rem" }}>⛔</span>
                            <span>Bearbeitung gesperrt</span>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button onClick={() => startEdit(t)}>✏️</button>
                              <button onClick={() => confirmDelete(t.id)}>🗑️</button>
                            </div>
                            <span style={{ fontSize: "0.75rem", color: "gray", paddingTop: "0.25rem", paddingLeft: "0.25rem" }}>
                              ⚠️ Nach Ergebniseintragung keine Änderung mehr möglich
                            </span>
                            {loeschWarnung === t.id && (
                              <div style={{ color: "red", marginTop: "6px" }}>
                                <span>Wirklich löschen?</span>
                                <button onClick={() => performDelete(t.id)}>Ja</button>
                                <button onClick={() => setLoeschWarnung(null)}>Nein</button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {activeTab === "ergebnisse" && verein && (
        <VereinErgebnisseEintragen
          verein={verein}
          onBack={() => setActiveTab("teilnehmer")}
        />
      )}

      {activeTab === "meineErgebnisse" && verein && (
        <VereinErgebnisseAnzeigen verein={verein} />
      )}
    </div>
  );
}
