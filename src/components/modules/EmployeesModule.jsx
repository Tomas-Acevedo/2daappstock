
import React from 'react';
import { motion } from 'framer-motion';
import { Users, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const EmployeesModule = () => {
  const handleAddEmployee = () => {
    toast({
      title: '🚧 Esta función no está implementada todavía',
      description: '¡No te preocupes! Puedes solicitarla en tu próximo prompt! 🚀',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Empleados</h1>
          <p className="text-gray-600">Gestiona el equipo de tu sucursal</p>
        </div>
        <Button onClick={handleAddEmployee} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Agregar Empleado
        </Button>
      </div>

      <div className="bg-white/70 backdrop-blur-lg rounded-xl p-8 border border-gray-200 text-center text-gray-900">
        <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Módulo de Empleados</h3>
        <p className="text-gray-600 mb-4">Administra tu equipo y sus roles</p>
        <Button onClick={handleAddEmployee} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          Comenzar
        </Button>
      </div>
    </motion.div>
  );
};

export default EmployeesModule;
