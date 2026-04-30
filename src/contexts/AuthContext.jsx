import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/customSupabaseClient";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const fetchProfile = async (authUser) => {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (error) {
        console.warn("AuthContext: profile fetch error:", error);
        setUser((prev) => (prev?.id === authUser.id ? { ...prev, profile: null } : prev));
        return null;
      }

      setUser((prev) => {
        if (!prev || prev.id !== authUser.id) return prev;
        return { ...prev, profile: data ?? null };
      });

      return data ?? null;
    } catch (e) {
      console.warn("AuthContext: profile fetch crashed:", e);
      return null;
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const restore = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) console.warn("AuthContext: getSession error:", error);
        if (!mounted) return;

        if (session?.user) {
          // Inicialmente ponemos el user; si ya estaba cargado no reseteamos el perfil
          setUser({ ...session.user, profile: null });
          fetchProfile(session.user);
        } else {
          setUser(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    restore();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser((prev) => {
          // ✅ Si el usuario es el mismo y ya tenemos su perfil, NO lo ponemos en null
          // Esto evita que ProtectedRoute desmonte la app al volver a la pestaña
          if (prev?.id === session.user.id && prev.profile) {
            return { ...session.user, profile: prev.profile };
          }
          
          // Si es un cambio de usuario o no había perfil, lo buscamos
          fetchProfile(session.user);
          return { ...session.user, profile: null };
        });
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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data?.user) throw new Error("No user returned from Supabase");

      setUser({ ...data.user, profile: null });
      await fetchProfile(data.user);
      return data.user;
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
    <AuthContext.Provider value={{ user, login, logout, loading, profileLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};