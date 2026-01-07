import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Settings,
  ArrowLeft,
  Wallet,
  FileText,
  Banknote,
  X,
  ClipboardList,
  Clock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOffline } from "@/contexts/OfflineContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/customSupabaseClient";
import { getBranchConfigOffline, cacheBranchConfig } from "@/lib/offlineDb";

const Sidebar = ({ onClose }) => {
  const { user } = useAuth();
  const { online } = useOffline();
  const navigate = useNavigate();
  const location = useLocation();
  const { branchId } = useParams();

  const [showJornadas, setShowJornadas] = useState(false);

  const role = user?.profile?.role;

  useEffect(() => {
    let mounted = true;

    const resolveAllowJornadas = async () => {
      if (!branchId) return;

      // 1) Si estamos OFFLINE, leemos de IndexedDB
      if (!online) {
        try {
          const cfg = await getBranchConfigOffline(branchId);
          if (!mounted) return;
          setShowJornadas(!!cfg?.allow_jornadas);
          return;
        } catch (e) {
          console.warn("[Sidebar] getBranchConfigOffline failed:", e);
          if (!mounted) return;
          setShowJornadas(false);
          return;
        }
      }

      // 2) Si estamos ONLINE, leemos de Supabase y cacheamos en IndexedDB
      try {
        const { data, error } = await supabase
          .from("branches")
          .select("allow_jornadas")
          .eq("id", branchId)
          .single();

        if (error) throw error;

        if (!mounted) return;

        const allow = !!data?.allow_jornadas;
        setShowJornadas(allow);

        // Cachear para offline (en tu store branch_config, keyPath: "id")
        await cacheBranchConfig({ id: branchId, allow_jornadas: allow });
      } catch (e) {
        console.warn("[Sidebar] supabase allow_jornadas failed, fallback to IDB:", e);

        // fallback: si supabase falla (aunque online), intento IDB
        try {
          const cfg = await getBranchConfigOffline(branchId);
          if (!mounted) return;
          setShowJornadas(!!cfg?.allow_jornadas);
        } catch (e2) {
          console.warn("[Sidebar] fallback getBranchConfigOffline failed:", e2);
          if (!mounted) return;
          setShowJornadas(false);
        }
      }
    };

    resolveAllowJornadas();

    // Escuchar cambios en tiempo real desde Configuration page
    const handleConfigUpdate = async (e) => {
      if (e?.detail?.field === "allow_jornadas") {
        const val = !!e.detail.value;
        setShowJornadas(val);

        // Guardar cache también (sirve para offline aunque lo cambies online)
        if (branchId) {
          try {
            await cacheBranchConfig({ id: branchId, allow_jornadas: val });
          } catch (err) {
            console.warn("[Sidebar] cacheBranchConfig from event failed:", err);
          }
        }
      }
    };

    window.addEventListener("branch-config-updated", handleConfigUpdate);

    return () => {
      mounted = false;
      window.removeEventListener("branch-config-updated", handleConfigUpdate);
    };
  }, [branchId, online]);

  const getMenuItems = () => {
    const baseItems =
      role === "owner"
        ? [
            { icon: LayoutDashboard, label: "Estadísticas", path: "" },
            { icon: ShoppingCart, label: "Ventas", path: "sales" },
            { icon: ClipboardList, label: "Pedidos", path: "orders" },
            { icon: Package, label: "Productos", path: "inventory" },
            { icon: Wallet, label: "Caja", path: "caja" },
            { icon: Banknote, label: "Gastos", path: "expenses" },
            { icon: FileText, label: "Logs", path: "logs" },
            { icon: Settings, label: "Configuración", path: "configuration" },
          ]
        : [
            { icon: ShoppingCart, label: "Ventas", path: "sales" },
            { icon: ClipboardList, label: "Pedidos", path: "orders" },
            { icon: Package, label: "Productos", path: "inventory" },
            { icon: Wallet, label: "Caja", path: "caja" },
          ];

    if (showJornadas) {
      const position = role === "owner" ? 6 : 4;
      baseItems.splice(position, 0, { icon: Clock, label: "Jornadas", path: "jornadas" });
    }

    return baseItems;
  };

  const handleNavigation = (path) => {
    navigate(`/branch/${branchId}/${path}`);
    if (onClose) onClose();
  };

  const handleReturnToTower = () => {
    navigate("/torre-control");
    if (onClose) onClose();
  };

  const isActive = (path) => {
    const segments = location.pathname.split("/");
    const lastSegment = segments[segments.length - 1];
    if (path === "") return lastSegment === branchId;
    return lastSegment === path;
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-full flex flex-col justify-between shadow-sm">
      <div className="flex flex-col h-full">
        <div className="lg:hidden p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <span className="font-bold text-gray-900">Menú</span>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="w-5 h-5 text-gray-500" />
          </Button>
        </div>

        <nav className="p-4 space-y-1 flex-1 overflow-y-auto">
          {getMenuItems().map((item) => (
            <button
              key={item.label}
              onClick={() => handleNavigation(item.path)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group font-medium text-sm",
                isActive(item.path)
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                  : "text-gray-600 hover:bg-gray-50 hover:text-indigo-600"
              )}
            >
              <item.icon
                className={cn(
                  "w-5 h-5 transition-transform group-hover:scale-105",
                  isActive(item.path) ? "text-white" : "text-gray-400 group-hover:text-indigo-600"
                )}
              />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {role === "owner" && (
          <div className="p-4 border-t border-gray-100 bg-gray-50/50">
            <Button
              onClick={handleReturnToTower}
              variant="outline"
              className="w-full justify-start text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 border-gray-200"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Torre de Control
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
