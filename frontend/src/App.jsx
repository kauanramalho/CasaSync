import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "./layouts/AppLayout";
import { useAuth } from "./hooks/useAuth";

const Calendar = lazy(() => import("./pages/Calendar"));
const Categories = lazy(() => import("./pages/Categories"));
const CoupleSpace = lazy(() => import("./pages/CoupleSpace"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Family = lazy(() => import("./pages/Family"));
const Login = lazy(() => import("./pages/Login"));
const NewTask = lazy(() => import("./pages/NewTask"));
const Ranking = lazy(() => import("./pages/Ranking"));
const Register = lazy(() => import("./pages/Register"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Tasks = lazy(() => import("./pages/Tasks"));
const VerifyCode = lazy(() => import("./pages/VerifyCode"));

function PageLoader() {
  return <div className="grid min-h-[40vh] place-items-center text-sm font-semibold text-muted">Carregando CasaSync...</div>;
}

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
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />
        <Route path="/verificacao" element={<VerifyCode />} />
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
          <Route path="/relatorios" element={<Reports />} />
          <Route path="/configuracoes" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
