import React from "react";

const Card = ({ children }) => {
  return (
    <div
      style={{
        background: "white",
        padding: "16px",
        borderRadius: "8px",
        boxShadow: "0 0 10px rgba(0,0,0,0.1)",
        marginBottom: "16px",
      }}
    >
      {children}
    </div>
  );
};

export default Card;
