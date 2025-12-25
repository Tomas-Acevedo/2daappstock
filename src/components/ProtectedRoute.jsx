import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading, profileLoading } = useAuth();
  const location = useLocation();

  // 1) Esperar restaurar sesión (sin pantalla full-screen para evitar "pantallazo" al volver a la pestaña)
  if (loading) return null;

  // 2) No logueado
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  // 3) Si requiere rol, esperar profile (sin spinner full-screen)
  if (requiredRole) {
    if (profileLoading || !user.profile) return null;

    if (user.profile.role !== requiredRole) {
      return <Navigate to="/login" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
