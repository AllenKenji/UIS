import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import "./styles/app.css";

import { UserProvider } from "./context/UserContext";
import { ThemeProvider } from "./context/ThemeContext"; // new context
import AppRoutes from "./routes/AppRoutes";

function App() {
  return (
    <UserProvider>
      <ThemeProvider>
        <Router>
          <div className="app-wrapper">
            <AppRoutes />
            <ToastContainer position="top-right" autoClose={3000} />
          </div>
        </Router>
      </ThemeProvider>
    </UserProvider>
  );
}

export default App;
