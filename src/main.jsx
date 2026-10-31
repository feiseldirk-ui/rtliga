import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";
import AppValidationNotice from "./shared/ui/AppValidationNotice";
import "./index.css";

if (import.meta.env.PROD) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
  <App />
  <AppValidationNotice />
</HashRouter>
  </React.StrictMode>
);
