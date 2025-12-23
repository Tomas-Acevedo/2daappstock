import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/customSupabaseClient";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  const [loading, setLoading] = useState(true);          // sesión
  const [profileLoading, setProfileLoading] = useState(false); // perfil/rol

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
        // mantenemos el user igual, pero profile queda null
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
          setUser({ ...session.user, profile: null });
          // 👇 importante: arrancamos profile async, pero sin romper la UI
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
        setUser({ ...session.user, profile: null });
        fetchProfile(session.user);
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
      fetchProfile(data.user);

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
