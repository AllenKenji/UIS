import { BrowserRouter as Router } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { NotificationProvider } from "./context/NotificationContext";
import { UserProvider, useUser } from "./context/UserContext";
import { ThemeProvider } from "./context/ThemeContext";
import AppRoutes from "./routes/AppRoutes";
import "./styles/app.css";

function AppContent() {
  const { token } = useUser(); // ✅ safe here, inside UserProvider

  return (
    <ThemeProvider>
      <NotificationProvider token={token}>
        <Router>
          <div className="app-wrapper">
            <AppRoutes />
            <ToastContainer position="top-right" autoClose={3000} />
          </div>
        </Router>
      </NotificationProvider>
    </ThemeProvider>
  );
}

function App() {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
}

export default App;
