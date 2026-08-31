import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { LiveLocationProvider } from "./context/LiveLocationContext";
import { CompanyProvider } from "./context/CompanyContext";
import ErrorBoundary from "./components/ErrorBoundary";
import App from "./App";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <LiveLocationProvider>
            <CompanyProvider>
              <App />
            </CompanyProvider>
          </LiveLocationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

