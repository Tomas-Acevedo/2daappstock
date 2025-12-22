import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const PostLoginRedirect = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Si todavía está restaurando sesión / hidratando
    if (loading) return;

    // Si no hay user, volver a login
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    // Si todavía no llegó el profile, esperamos (mostramos spinner)
    const role = user.profile?.role;
    const branchId = user.profile?.branch_id;

    if (!role) return;

    // ✅ Redirección final por rol
    if (role === "owner") {
      navigate("/torre-control", { replace: true });
    } else if (role === "branch") {
      if (branchId) {
        navigate(`/branch/${branchId}/sales`, { replace: true });
      } else {
        // si no tiene sucursal asignada, lo mandamos al login
        navigate("/login", { replace: true });
      }
    } else {
      navigate("/torre-control", { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500" />
        <p className="text-white/80 text-sm">Ingresando...</p>
      </div>
    </div>
  );
};

export default PostLoginRedirect;
