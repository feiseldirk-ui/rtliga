// src/tabs/AdminsTab.jsx
import React, { useState, useEffect } from "react";
import supabase from "../supabaseClient";
import TextInput from "../ui/TextInput";
import { PrimaryButton } from "../ui/Buttons";
import { useNavigate } from "react-router-dom";
import ZeitfensterTab from "./ZeitfensterTab";
import ErgebnisseTab from "./ErgebnisseTab";
import VereineTab from "./VereineTab"; // <-- Eingebunden

const AdminsTab = () => {
  const [admins, setAdmins] = useState([]);
  const [newAdmin, setNewAdmin] = useState("");
  const [adminName, setAdminName] = useState("");
  const [verified, setVerified] = useState(false);
  const [activeTab, setActiveTab] = useState("admin");
  const navigate = useNavigate();

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    const { data, error } = await supabase.from("admins").select("*");
    if (error) console.error("Fehler beim Laden der Admins:", error);
    else setAdmins(data);
  };

  const verifyAdmin = () => {
    const exists = admins.some(
      (admin) => admin.name.toLowerCase() === adminName.trim().toLowerCase()
    );
    if (exists) {
      setVerified(true);
    } else {
      alert("Zugriff verweigert: Kein Admin mit diesem Namen gefunden.");
      navigate("/");
    }
  };

  const addAdmin = async () => {
    if (!newAdmin) return;
    const { error } = await supabase.from("admins").insert({ name: newAdmin });
    if (error) console.error("Fehler beim Hinzufügen:", error);
    else {
      setNewAdmin("");
      fetchAdmins();
    }
  };

  if (!verified) {
    return (
      <div>
        <h2>Admin-Zugang</h2>
        <TextInput
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          placeholder="Admin-Name eingeben"
        />
        <PrimaryButton onClick={verifyAdmin}>Weiter</PrimaryButton>
        <button onClick={() => navigate("/")}>Zurück</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem" }}>
      <button onClick={() => navigate("/")}>Zurück</button>
      <h2>Adminbereich – {adminName}</h2>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "2rem", margin: "2rem 0" }}>
        <button onClick={() => setActiveTab("admin")}>Admin</button>
        <button onClick={() => setActiveTab("vereine")}>Vereine</button>
        <button onClick={() => setActiveTab("zeitfenster")}>Zeitfenster</button>
        <button onClick={() => setActiveTab("ergebnisse")}>Ergebnisse</button>
      </div>

      {/* Inhalte */}
      {activeTab === "admin" && (
        <div>
          <h3>Admins verwalten</h3>
          <ul>
            {admins.map((admin) => (
              <li key={admin.id}>{admin.name}</li>
            ))}
          </ul>
          <TextInput
            value={newAdmin}
            onChange={(e) => setNewAdmin(e.target.value)}
            placeholder="Neuer Admin-Name"
          />
          <PrimaryButton onClick={addAdmin}>Hinzufügen</PrimaryButton>
        </div>
      )}

      {activeTab === "vereine" && <VereineTab />}
      {activeTab === "zeitfenster" && <ZeitfensterTab />}
      {activeTab === "ergebnisse" && <ErgebnisseTab />}
    </div>
  );
};

export default AdminsTab;
