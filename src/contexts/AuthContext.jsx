
import React, { createContext, useContext, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // STRICT "NO AUTO-LOGIN" POLICY
  // 1. user is null by default.
  // 2. loading is false by default (we are not checking anything).
  // 3. No useEffect checking for sessions on mount.
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    console.log("AuthContext: Manual login started for", email);
    setLoading(true);

    try {
      // Step 1: Authenticate with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("AuthContext: Supabase Auth Error:", error);
        throw error;
      }

      if (!data?.user) {
        throw new Error("No user returned from Supabase");
      }

      console.log("AuthContext: Auth successful, fetching profile...");

      // Step 2: Fetch Profile Manually
      let profile = null;
      try {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();
        
        if (profileError) {
          console.warn("AuthContext: Profile fetch warning:", profileError);
        } else {
          profile = profileData;
        }
      } catch (err) {
        console.warn("AuthContext: Profile fetch crashed (non-critical)", err);
      }

      // Step 3: Construct User Object
      const fullUser = {
        ...data.user,
        profile: profile
      };

      console.log("AuthContext: Setting user state manually.");
      setUser(fullUser);

      // Step 4: Log Login Activity (Fire and forget)
      if (profile?.branch_id) {
          supabase.rpc('log_login_activity', { p_branch_id: profile.branch_id })
            .then(({ error }) => { if(error) console.error("Login logging failed", error); });
      } else if (profile?.role === 'owner') {
          // Log owner login (branch_id null)
          supabase.rpc('log_login_activity', { p_branch_id: null })
            .then(({ error }) => { if(error) console.error("Login logging failed", error); });
      }

      return fullUser;

    } catch (error) {
      console.error("AuthContext: Login Failed", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    console.log("AuthContext: Logging out...");
    try {
      // Attempt to notify server, but don't block UI if it fails
      await supabase.auth.signOut(); 
    } catch (err) {
      console.error("AuthContext: SignOut API error (ignoring)", err);
    } finally {
      // ALWAYS clear local state
      setUser(null);
    }
  };

  const value = {
    user,
    login,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
