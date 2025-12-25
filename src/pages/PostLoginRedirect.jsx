import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const PostLoginRedirect = () => {
  const { user, loading, profileLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    // Esperar a que llegue el profile
    if (profileLoading || !user.profile) return;

    const role = user.profile.role;
    const branchId = user.profile.branch_id;

    if (role === "owner") {
      navigate("/torre-control", { replace: true });
    } else if (role === "branch") {
      if (branchId) navigate(`/branch/${branchId}/sales`, { replace: true });
      else navigate("/login", { replace: true });
    } else {
      navigate("/torre-control", { replace: true });
    }
  }, [user, loading, profileLoading, navigate]);

return null;


};

export default PostLoginRedirect;
