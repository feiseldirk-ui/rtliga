import React from "react";

const RoleSelect = ({ onSelect }) => {
  return (
    <div style={{ textAlign: "center", paddingTop: "100px" }}>
      <h2>Wähle deinen Bereich</h2>
      <button onClick={() => onSelect("admin")} style={buttonStyle}>
        Admin
      </button>
      <button onClick={() => onSelect("verein")} style={buttonStyle}>
        Verein
      </button>
    </div>
  );
};

const buttonStyle = {
  margin: "10px",
  padding: "12px 20px",
  fontSize: "16px",
  cursor: "pointer",
};

export default RoleSelect;
