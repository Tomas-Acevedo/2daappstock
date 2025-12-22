
import React, { useState } from 'react';
import { Mail, Lock, Building, MapPin, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';

const BranchCreationForm = ({ ownerId, onSuccess, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    email: '',
    password: ''
  });

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password) {
      toast({
        title: "Campos incompletos",
        description: "Por favor complete nombre, correo y contraseña.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      console.log("Invoking create-branch with:", { ...formData, owner_id: ownerId });
      
      const { data, error } = await supabase.functions.invoke('create-branch', {
        body: {
          ...formData,
          owner_id: ownerId
        }
      });

      if (error) {
        // Handle Edge Function invocation errors (e.g. 500/400 codes)
        try {
            // Sometimes error is a JSON string response
            const errorBody = JSON.parse(error.message);
            throw new Error(errorBody.error || error.message);
        } catch (e) {
            throw error;
        }
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: "¡Sucursal creada!",
        description: (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span>Sucursal registrada y usuario vinculado exitosamente.</span>
          </div>
        ),
      });

      // Clear form
      setFormData({ name: '', address: '', email: '', password: '' });
      
      // Notify parent
      if (onSuccess) onSuccess();

    } catch (err) {
      console.error("Error creating branch:", err);
      toast({
        title: "Error al crear sucursal",
        description: err.message || "Ocurrió un error inesperado.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Building className="w-4 h-4 text-indigo-500" />
          Nombre de la Sucursal
        </label>
        <input
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="Ej: Sucursal Centro"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-indigo-500" />
          Dirección (Opcional)
        </label>
        <input
          name="address"
          value={formData.address}
          onChange={handleChange}
          placeholder="Calle 123, Colonia..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
          disabled={loading}
        />
      </div>

      <div className="p-4 bg-indigo-50/50 rounded-lg border border-indigo-100 space-y-4">
        <h4 className="text-sm font-semibold text-indigo-900 mb-2">Credenciales de Acceso</h4>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Mail className="w-4 h-4 text-indigo-500" />
            Correo Electrónico (Usuario)
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="sucursal@franquify.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-500" />
            Contraseña
          </label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="••••••••"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
            disabled={loading}
          />
          <p className="text-xs text-gray-500">
            Esta contraseña se usará para iniciar sesión en la sucursal.
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        {onCancel && (
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </Button>
        )}
        <Button 
          type="submit" 
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[140px]"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Creando...
            </>
          ) : (
            'Crear Sucursal'
          )}
        </Button>
      </div>
    </form>
  );
};

export default BranchCreationForm;
