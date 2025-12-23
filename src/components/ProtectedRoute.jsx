import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-900">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
  </div>
);

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading, profileLoading } = useAuth();
  const location = useLocation();

  // 1) Esperar restaurar sesión
  if (loading) return <Spinner />;

  // 2) No logueado
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  // 3) Si requiere rol, esperar profile (evita “me desloguea” al reabrir PWA)
  if (requiredRole) {
    if (profileLoading || !user.profile) return <Spinner />;

    if (user.profile.role !== requiredRole) {
      return <Navigate to="/login" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
