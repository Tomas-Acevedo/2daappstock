import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { getPendingCount, initOfflineDb } from "@/lib/offlineDb";
import { syncPendingActions } from "@/lib/offlineSync";

const OfflineContext = createContext(null);

export const OfflineProvider = ({ children }) => {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const syncingRef = useRef(false);
  const lastSyncAtRef = useRef(0);

  const refreshPending = useCallback(async () => {
    await initOfflineDb();
    const c = await getPendingCount();
    setPendingCount(c);
    return c;
  }, []);

  const syncNow = useCallback(
    async ({ force = false } = {}) => {
      if (!navigator.onLine) return;
      if (syncingRef.current) return;

      const now = Date.now();

      // ✅ Debounce MUY chico (para no spamear), pero sin lag
      if (!force && now - lastSyncAtRef.current < 200) return;

      syncingRef.current = true;
      setSyncing(true);
      lastSyncAtRef.current = now;

      try {
        const res = await syncPendingActions();

        window.dispatchEvent(new Event("attendance:refresh"));
        window.dispatchEvent(new Event("inventory:refresh"));
        window.dispatchEvent(new Event("sales:refresh"));
        window.dispatchEvent(new Event("dashboard:refresh"));
        window.dispatchEvent(new Event("orders:refresh"));
        window.dispatchEvent(new Event("cash:refresh"));
        window.dispatchEvent(new Event("expenses:refresh"));

        window.dispatchEvent(
          new CustomEvent("offline:sync-complete", { detail: res })
        );

        return res;
      } finally {
        syncingRef.current = false;
        setSyncing(false);
        // ✅ refrescamos contador al final
        await refreshPending();
      }
    },
    [refreshPending]
  );

  // Inicial
  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  // ✅ ONLINE/OFFLINE: sync inmediato al volver internet (NO esperamos IDB)
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);

      // ✅ 1) Intento de sync INMEDIATO (force)
      // (si por “micro-instante” la red todavía no está lista, igual tenés el poll como backup)
      syncNow({ force: true }).catch(() => {});

      // ✅ 2) En paralelo refrescamos el contador (no bloquea al sync)
      refreshPending().catch(() => {});
    };

    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshPending, syncNow]);

  // Fallback: foco / volver visible
  useEffect(() => {
    const tryAutoSync = async () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine) return;
      await syncNow({ force: true });
    };

    const onFocus = () => {
      tryAutoSync().catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tryAutoSync().catch(() => {});
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [syncNow]);

  // Poll de backup (más rápido cuando hay pendientes)
  useEffect(() => {
    const id = setInterval(async () => {
      if (syncingRef.current) return;
      if (!navigator.onLine) return;

      // ✅ Solo si hay pendientes intentamos sync
      const c = await refreshPending();
      if (c > 0) {
        await syncNow();
      }
    }, 1500); // ✅ más rápido que 5000ms, pero solo actúa si hay pendientes

    return () => clearInterval(id);
  }, [refreshPending, syncNow]);

  const value = useMemo(
    () => ({ online, syncing, pendingCount, refreshPending, syncNow }),
    [online, syncing, pendingCount, refreshPending, syncNow]
  );

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = () => useContext(OfflineContext);
