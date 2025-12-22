import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/customSupabaseClient";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  // loading = "estado global de auth"
  // empieza true porque vamos a restaurar sesión al montar
  const [loading, setLoading] = useState(true);

  // Traer profile sin romper (si falla, no bloquea sesión)
  const hydrateProfileAsync = async (authUser) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (error) {
        console.warn("AuthContext: profile fetch error:", error);
        return;
      }

      setUser((prev) => {
        // si el user cambió (logout/cambio), no tocar
        if (!prev || prev.id !== authUser.id) return prev;
        return { ...prev, profile: data ?? null };
      });
    } catch (e) {
      console.warn("AuthContext: profile fetch crashed:", e);
    }
  };

  useEffect(() => {
    let mounted = true;

    const restore = async () => {
      try {
        console.log("AuthContext: restoring session...");
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) console.warn("AuthContext: getSession error:", error);

        if (!mounted) return;

        if (session?.user) {
          // ✅ setUser inmediato (sin esperar profiles)
          setUser({ ...session.user, profile: null });
          hydrateProfileAsync(session.user);
          console.log("AuthContext: session restored ✅");
        } else {
          setUser(null);
          console.log("AuthContext: no session");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    restore();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("AuthContext: auth state changed:", _event);

      if (session?.user) {
        setUser({ ...session.user, profile: null });
        hydrateProfileAsync(session.user);
      } else {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    setLoading(true);

    try {
      console.log("AuthContext: Manual login started for", email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (!data?.user) throw new Error("No user returned from Supabase");

      // ✅ setUser inmediato (no se cuelga aunque profiles falle)
      const authUser = data.user;
      const fullUser = { ...authUser, profile: null };
      setUser(fullUser);

      // ✅ profile en background
      hydrateProfileAsync(authUser);

      // ✅ log de actividad (no bloquea)
      // (si tu función requiere branch_id y depende del profile, la puedes mover a cuando profile existe)
      // Por ahora lo dejamos fuera para que NO trabe el login

      return fullUser;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
