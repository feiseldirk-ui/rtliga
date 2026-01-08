import React, { useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

import VereinStart from "./tabs/VereinStart";
import AdminsTab from "./tabs/AdminsTab";
import VereinRegistrierung from "./components/VereinRegistrierung";
import VereinLogin from "./components/VereinLogin";
import PasswortZuruecksetzen from "./pages/PasswortZuruecksetzen";

function Auswahlseite() {
  const navigate = useNavigate();
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        textAlign: "center",
        padding: "1rem",
      }}
    >
      <h1 style={{ marginBottom: "2rem" }}>Login Bereich</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <button onClick={() => navigate("/login")}>Login Verein</button>
        <button onClick={() => navigate("/registrieren")}>Registrieren</button>
        <button onClick={() => navigate("/admin")}>Admin</button>
      </div>
    </div>
  );
}

function App() {
  const [verein, setVerein] = useState(null);

  return (
    <Routes>
      <Route path="/" element={<Auswahlseite />} />
      <Route
        path="/login"
        element={
          <VereinLogin onLoginErfolg={(vereinObj) => setVerein(vereinObj)} />
        }
      />
      <Route path="/registrieren" element={<VereinRegistrierung />} />
      <Route path="/passwort-zuruecksetzen" element={<PasswortZuruecksetzen />} />
      <Route path="/verein" element={<VereinStart verein={verein} />} />
      <Route path="/admin" element={<AdminsTab />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
