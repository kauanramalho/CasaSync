import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "./layouts/AppLayout";
import { useAuth } from "./hooks/useAuth";
import AiPlanner from "./pages/AiPlanner";
import Calendar from "./pages/Calendar";
import Categories from "./pages/Categories";
import CoupleSpace from "./pages/CoupleSpace";
import Dashboard from "./pages/Dashboard";
import Family from "./pages/Family";
import Login from "./pages/Login";
import NewTask from "./pages/NewTask";
import Ranking from "./pages/Ranking";
import Register from "./pages/Register";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Tasks from "./pages/Tasks";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm font-semibold text-muted">Carregando CasaSync...</div>;
  }

  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Register />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="/tarefas" element={<Tasks />} />
        <Route path="/tarefas/nova" element={<NewTask />} />
        <Route path="/calendario" element={<Calendar />} />
        <Route path="/categorias" element={<Categories />} />
        <Route path="/familia" element={<Family />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/espaco-do-casal" element={<CoupleSpace />} />
        <Route path="/planejador-ia" element={<AiPlanner />} />
        <Route path="/relatorios" element={<Reports />} />
        <Route path="/configuracoes" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

