import { AuthProvider } from "./contexts/AuthContext";
import { Router } from "./components/Router";

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
