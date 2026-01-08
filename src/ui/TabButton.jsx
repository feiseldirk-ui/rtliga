import React from "react";

const TabButton = ({ label, onClick, active }) => {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 15px",
        borderRadius: "4px",
        border: "1px solid #ccc",
        backgroundColor: active ? "#007bff" : "white",
        color: active ? "white" : "black",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
};

export default TabButton;
