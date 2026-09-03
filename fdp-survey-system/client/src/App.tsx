import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import SurveyList from "./pages/SurveyList";
import SurveyForm from "./pages/SurveyForm";
import UserManagement from "./pages/UserManagement";
import Settings from "./pages/Settings";
import HouseholdMasterList from "./pages/HouseholdMasterList";
import HouseholdProfile from "./pages/HouseholdProfile";
import DataValidation from "./pages/DataValidation";
import BarangayPerformance from "./pages/BarangayPerformance";
import Reports from "./pages/Reports";
import CBMSData from "./pages/CBMSData";
import LoginPage from "./pages/LoginPage";
import { useEffect } from "react";
import { useAuth } from "./_core/hooks/useAuth";

type AppRole = "admin" | "surveyor" | "supervisor";

const toAppRole = (role: string | null | undefined): AppRole => {
  if (role === "admin" || role === "surveyor" || role === "supervisor") {
    return role;
  }
  return "surveyor";
};

function App() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const role = toAppRole(user?.role);
  const currentPath = typeof window !== "undefined" ? window.location.pathname : location;
  const isLoginPath = currentPath === "/login" || currentPath.endsWith("/login");
  const hasLoggedOutMarker =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("loggedOut");
  const shouldForceLoginScreen = hasLoggedOutMarker && isLoginPath;

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated && !isLoginPath) {
      setLocation("/login");
      return;
    }

    if (isAuthenticated && isLoginPath && !hasLoggedOutMarker) {
      setLocation("/");
    }
  }, [hasLoggedOutMarker, isAuthenticated, isLoginPath, loading, setLocation]);

  if (loading) {
    return (
      <ErrorBoundary>
        <ThemeProvider defaultTheme="light">
          <TooltipProvider>
            <Toaster />
            <div className="min-h-screen flex items-center justify-center text-muted-foreground">
              Loading session...
            </div>
          </TooltipProvider>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          {!isAuthenticated || shouldForceLoginScreen ? (
            <Switch>
              <Route path="/login" component={LoginPage} />
              <Route component={LoginPage} />
            </Switch>
          ) : (
            <Layout
              role={role}
              userName={user?.name ?? "Survey User"}
              userEmail={user?.email ?? null}
              onLogout={logout}
            >
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/surveys" component={SurveyList} />
                <Route path="/surveys/new" component={SurveyForm} />
                <Route path="/users">
                  {role === "admin" ? <UserManagement /> : <NotFound />}
                </Route>
                <Route path="/settings">
                  <Settings />
                </Route>
                <Route path="/households" component={HouseholdMasterList} />
                <Route path="/households/:id" component={HouseholdProfile} />
                <Route path="/validation">
                  {role === "admin" || role === "supervisor" ? <DataValidation /> : <NotFound />}
                </Route>
                <Route path="/performance">
                  {role === "admin" || role === "supervisor" ? <BarangayPerformance /> : <NotFound />}
                </Route>
                <Route path="/reports" component={Reports} />
                <Route path="/cbms" component={CBMSData} />
                <Route component={NotFound} />
              </Switch>
            </Layout>
          )}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
