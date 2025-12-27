import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Calendar, Loader2, Mail, Filter } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const LogsPage = () => {
  const { branchId } = useParams();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branchName, setBranchName] = useState('Sucursal');
  
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('en-CA'));

  const translateAction = (action) => {
    const actions = {
      INSERT: 'CREAR',
      UPDATE: 'EDITAR',
      DELETE: 'ELIMINAR',
      LOGIN: 'INGRESO',
    };
    return actions[action] || action;
  };

  const formatAnyNumberInText = (text) => {
    if (!text || typeof text !== 'string') return text;
    return text.replace(
      /(^|[^\d])(\d{1,3}(?:[.,]\d{3})+|\d+)([.,]\d+)?(?!\d)/g,
      (match, prefix, intPartRaw, decPartRaw) => {
        const alreadyEsAR = /\d{1,3}(\.\d{3})+(,\d+)?$/.test(`${intPartRaw}${decPartRaw || ''}`);
        if (alreadyEsAR) return match;
        let normalizedInt = String(intPartRaw).replace(/[.,]/g, '');
        let normalizedDec = '';
        if (decPartRaw) normalizedDec = String(decPartRaw).replace(',', '.');
        const num = Number(`${normalizedInt}${normalizedDec}`);
        if (!Number.isFinite(num)) return match;
        const hasMeaningfulDecimals = Math.round(num) !== num;
        const formatted = num.toLocaleString('es-AR', {
          minimumFractionDigits: hasMeaningfulDecimals ? 2 : 0,
          maximumFractionDigits: hasMeaningfulDecimals ? 2 : 0,
        });
        return `${prefix}${formatted}`;
      }
    );
  };

  const parseMoneyLoose = (raw) => {
    if (raw == null) return null;
    let s = String(raw).trim();
    s = s.replace(/[^\d.,-]/g, '');
    if (!s) return null;
    const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
    if (lastSep > -1) {
      const intPart = s.slice(0, lastSep).replace(/[.,]/g, '');
      const decPart = s.slice(lastSep + 1).replace(/[.,]/g, '');
      const n = Number(intPart + (decPart ? `.${decPart}` : ''));
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const formatMoneyInText = (text) => {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\$\s*([0-9][0-9.,]*)/g, (_, amount) => {
      const num = parseMoneyLoose(amount);
      if (!Number.isFinite(num)) return `$${amount}`;
      return `$${Math.round(num).toLocaleString('es-AR')}`;
    });
  };

  const translateDescription = (desc) => {
    if (!desc) return desc;
    let translated = desc;

    const patterns = [
      // 1. Traducciones específicas de Gastos y Egresos (prioritarias)
      { regex: /^INSERT gastos:\s*(.*)/i, replacement: 'Nuevo Gasto: $1' },
      { regex: /^INSERT Cash expense:\s*(.*)/i, replacement: 'Nuevo Egreso de Caja: $1' },
      { regex: /^DELETE Product:\s*(.*)/i, replacement: 'Producto ELIMINADO: $1' },
      
      // 2. Otros registros técnicos
      { regex: /INSERT (?:cash_registers|cajas): [0-9a-fA-F-]{36}/i, replacement: 'Apertura de CAJA' },
      { regex: /Created new expenses record/i, replacement: 'Nuevo Gasto creado' },
      { regex: /Created new cash_expenses record/i, replacement: 'Nuevo registro de Egreso de Caja creado' },
      
      // 3. Traducciones genéricas de acciones
      { regex: /Deleted (.*) record/i, replacement: '$1 eliminado' },
      { regex: /Updated (.*) record/i, replacement: '$1 actualizado' },
      { regex: /Created new (.*) record/i, replacement: 'Nuevo $1 creado' },
      
      // 4. Ventas y Productos
      { regex: /UPDATE Product: (.*)/i, replacement: 'Producto EDITADO: $1' },
      { regex: /INSERT Product: (.*)/i, replacement: 'Producto CREADO: $1' },
      { regex: /INSERT Category: (.*)/i, replacement: 'Categoría CREADA: $1' },
      { regex: /UPDATE Category: (.*)/i, replacement: 'Categoría EDITADA: $1' },
      { regex: /DELETE Category: (.*)/i, replacement: 'Categoría ELIMINADA: $1' },
      
      { regex: /New Sale: (.*) via (.*) \| Products: (.*)/i, replacement: 'Nueva Venta: $1 | Metodo de pago: $2 | Productos: $3' },
      { regex: /New Sale: (.*) via (.*)/i, replacement: 'Nueva Venta: $1| Metodo de pago: $2' },
      { regex: /New Sale: (.*)/i, replacement: 'Nueva Venta: $1' },
      { regex: /User logged in/i, replacement: 'Sesión iniciada' },
    ];
    
    patterns.forEach(({ regex, replacement }) => {
      translated = translated.replace(regex, replacement);
    });

    const terms = {
      cash_expenses: 'egresos de caja',
      sales: 'ventas',
      cash_registers: 'cajas',
      expenses: 'gastos',
      transfer: 'transferencia',
      cash: 'efectivo',
    };

    Object.entries(terms).forEach(([en, es]) => {
      translated = translated.replace(new RegExp(`\\b${en}\\b`, 'g'), es);
    });

    return formatMoneyInText(translated);
  };

  useEffect(() => {
    if (branchId) {
      fetchBranchData();
      fetchLogs();
    }
  }, [branchId, selectedDate]);

  const fetchBranchData = async () => {
    const { data } = await supabase.from('branches').select('name').eq('id', branchId).single();
    if (data) setBranchName(data.name);
  };

  const fetchLogs = async () => {
    setLoading(true);
    // Ajuste UTC-3 para Argentina
    const startOfDayUTC = `${selectedDate}T03:00:00.000Z`;
    const dateObj = new Date(selectedDate + 'T00:00:00');
    dateObj.setDate(dateObj.getDate() + 1);
    const nextDay = dateObj.toLocaleDateString('en-CA');
    const endOfDayUTC = `${nextDay}T02:59:59.999Z`;

    const { data, error } = await supabase
      .from('activity_logs')
      .select(`*, profiles:user_id (email, role)`)
      .eq('branch_id', branchId)
      .gte('created_at', startOfDayUTC) 
      .lte('created_at', endOfDayUTC)   
      .order('created_at', { ascending: false });

    if (!error) setLogs(data || []);
    setLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registro de Actividad</h1>
          <p className="text-gray-500 text-sm">Auditoría de acciones en el sistema (ART)</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 shadow-sm">
            <Filter className="w-4 h-4 text-gray-400" />
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-sm outline-none text-gray-700 bg-transparent cursor-pointer"
            />
          </div>
          <div className="text-xs font-medium text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
            Sucursal: {branchName}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            <span>Cargando auditoría...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No hay actividad registrada para esta fecha.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
                <tr>
                  <th className="px-6 py-4">Usuario</th>
                  <th className="px-6 py-4">Acción</th>
                  <th className="px-6 py-4">Descripción</th>
                  <th className="px-6 py-4 text-right">Fecha / Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => {
                  const isOwner = log.profiles?.role === 'owner';
                  return (
                    <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-full ${isOwner ? 'bg-amber-100' : 'bg-slate-100'}`}>
                            <User className={`w-3.5 h-3.5 ${isOwner ? 'text-amber-600' : 'text-slate-500'}`} />
                          </div>
                          <span className={`font-medium ${isOwner ? 'text-gray-900' : 'text-indigo-600'}`}>
                            {(isOwner ? log.profiles?.email : branchName) || 'Sistema'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${
                          log.action === 'INSERT' ? 'bg-green-50 text-green-700 border-green-100' :
                          log.action === 'DELETE' ? 'bg-red-50 text-red-700 border-red-100' :
                          log.action === 'UPDATE' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                          log.action === 'LOGIN' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                          'bg-gray-50 text-gray-700 border-gray-100'
                        }`}>
                          {translateAction(log.action)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600 leading-relaxed">
                        {translateDescription(log.description)}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap text-gray-400 tabular-nums">
                        <div className="flex items-center justify-end gap-1.5">
                          <Calendar className="w-3 h-3" />
                          {formatDateTime(log.created_at)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default LogsPage;