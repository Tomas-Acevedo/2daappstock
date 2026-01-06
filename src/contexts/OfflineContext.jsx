import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { getPendingCount, initOfflineDb } from "@/lib/offlineDb";
import { syncPendingActions } from "@/lib/offlineSync";

const OfflineContext = createContext(null);

export const OfflineProvider = ({ children }) => {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPending = useCallback(async () => {
    await initOfflineDb();
    const c = await getPendingCount();
    setPendingCount(c);
  }, []);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);
    try {
      const res = await syncPendingActions();

      // Despachar eventos de refresco para todos los módulos
      window.dispatchEvent(new Event("inventory:refresh"));
      window.dispatchEvent(new Event("sales:refresh"));
      window.dispatchEvent(new Event("dashboard:refresh"));
      window.dispatchEvent(new Event("orders:refresh"));
      window.dispatchEvent(new Event("cash:refresh"));     // ✅ Nuevo para Caja
      window.dispatchEvent(new Event("expenses:refresh")); // ✅ Nuevo para Gastos

      window.dispatchEvent(new CustomEvent("offline:sync-complete", { detail: res }));
      return res;
    } finally {
      setSyncing(false);
      await refreshPending();
    }
  }, [refreshPending, syncing]);

  useEffect(() => { refreshPending(); }, [refreshPending]);

  useEffect(() => {
    const onOnline = async () => { setOnline(true); await syncNow(); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [syncNow]);

  const value = useMemo(() => ({ online, syncing, pendingCount, refreshPending, syncNow }), [online, syncing, pendingCount, refreshPending, syncNow]);
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
};

export const useOffline = () => useContext(OfflineContext);