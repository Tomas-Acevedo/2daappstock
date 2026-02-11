import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutGrid, Loader2, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/customSupabaseClient"; // Importamos supabase para la validación

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingUI, setLoadingUI] = useState(false);

  const { login, logout } = useAuth(); // Agregamos logout por si la sucursal está desactivada
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoadingUI(true);

    try {
      // 1. Intentamos el login normal
      const { user } = await login(email, password);

      // 2. Verificamos si este usuario pertenece a una sucursal desactivada
      // Nota: Buscamos en la tabla 'branches' si el email logueado coincide con el de la sucursal
      const { data: branch, error: branchError } = await supabase
        .from('branches')
        .select('is_visible')
        .eq('email', email)
        .single();

      // 3. Si existe la sucursal y is_visible es false, bloqueamos el acceso
      if (branch && branch.is_visible === false) {
        await logout(); // Cerramos la sesión que se acaba de abrir
        throw new Error("SUCURSAL_DESACTIVADA");
      }

      toast({
        title: "¡Bienvenido!",
        description: "Has iniciado sesión correctamente.",
      });

      // ✅ Redirección segura
      navigate("/post-login", { replace: true });

    } catch (error) {
      console.error("Login error:", error);
      
      let errorMessage = "Ocurrió un problema al intentar ingresar.";
      let errorTitle = "Error al iniciar sesión";

      if (error.message === "SUCURSAL_DESACTIVADA") {
        errorTitle = "Acceso Denegado";
        errorMessage = "Esta sucursal se encuentra temporalmente desactivada. Contacta al administrador.";
      } else if (error.message === "Invalid login credentials") {
        errorMessage = "Credenciales incorrectas. Verifica tu correo y contraseña.";
      }

      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoadingUI(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
      >
        <div className="p-8 pb-6 text-center">
          <div className="w-16 h-16 bg-indigo-600 rounded-xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-indigo-200">
            <LayoutGrid className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2"> Gestify</h1>
          <p className="text-gray-500 text-sm">Ingresa a tu cuenta para gestionar tu negocio</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 pt-0 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Correo Electrónico</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                placeholder="nombre@empresa.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loadingUI}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-6 rounded-xl font-semibold shadow-lg shadow-indigo-100 mt-4"
          >
            {loadingUI ? <Loader2 className="w-5 h-5 animate-spin" /> : "Iniciar Sesión"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
};

export default LoginPage;