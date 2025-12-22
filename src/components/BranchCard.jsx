
import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Users, DollarSign, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

const BranchCard = ({ branch, onEnter, index }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      whileHover={{ scale: 1.02 }}
      className="bg-white/70 backdrop-blur-lg rounded-xl p-6 border border-gray-200 hover:border-indigo-500/50 transition-all shadow-lg h-full flex flex-col justify-between text-gray-900"
    >
      <div>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">{branch.name}</h3>
            <div className="flex items-center text-gray-600 text-sm">
              <MapPin className="w-4 h-4 mr-1 text-gray-500" />
              {branch.location}
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            branch.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {branch.status === 'active' ? 'Activa' : 'Inactiva'}
          </span>
        </div>

        <div className="space-y-3 mb-6 bg-gray-50 p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 text-sm flex items-center">
              <DollarSign className="w-4 h-4 mr-1 text-green-600" />
              Ingresos
            </span>
            <span className="text-gray-800 font-semibold tracking-wide">{formatCurrency(branch.revenue)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 text-sm flex items-center">
              <Users className="w-4 h-4 mr-1 text-indigo-600" />
              Empleados
            </span>
            <span className="text-gray-800 font-semibold">{branch.employees}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-gray-200">
            <span className="text-gray-500 text-xs uppercase font-bold tracking-wider">Gerente</span>
            <span className="text-gray-700 text-sm">{branch.manager}</span>
          </div>
        </div>
      </div>

      <Button
        onClick={onEnter}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white transition-all group shadow-md shadow-indigo-200"
      >
        Ingresar a Sucursal
        <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
      </Button>
    </motion.div>
  );
};

export default BranchCard;
