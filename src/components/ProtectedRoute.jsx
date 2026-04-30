import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, loading, profileLoading } = useAuth();
  const location = useLocation();

  // 1) Esperar restaurar sesión inicial
  if (loading) return null;

  // 2) No logueado
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  // 3) Si requiere rol específico
  if (requiredRole) {
    // ✅ Si NO tenemos perfil Y todavía se está cargando por primera vez, esperamos.
    // Si YA tenemos un perfil en memoria, permitimos el paso aunque profileLoading sea true (silent refresh).
    if (!user.profile && profileLoading) return null;

    // Si ya terminó de cargar el perfil y no existe o el rol no coincide
    if (!user.profile || user.profile.role !== requiredRole) {
      // Solo redirigimos si definitivamente no hay una carga en curso que pueda darnos el perfil
      if (!profileLoading) {
          return <Navigate to="/login" replace />;
      }
      return null;
    }
  }

  return children;
};

export default ProtectedRoute;