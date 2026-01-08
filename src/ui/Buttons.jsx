import React from "react";

export const PrimaryButton = ({ children, onClick }) => (
  <button
    style={{
      backgroundColor: "#007bff",
      color: "white",
      border: "none",
      padding: "10px 20px",
      borderRadius: "4px",
      cursor: "pointer",
      marginTop: "10px",
    }}
    onClick={onClick}
  >
    {children}
  </button>
);
