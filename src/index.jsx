import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { LiveLocationProvider } from "./context/LiveLocationContext";
import { CompanyProvider } from "./context/CompanyContext";
import App from "./App";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LiveLocationProvider>
          <CompanyProvider>
            <App />
          </CompanyProvider>
        </LiveLocationProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
