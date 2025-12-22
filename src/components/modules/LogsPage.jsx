import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Calendar, Loader2, Mail, Send } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const LogsPage = () => {
  const { branchId } = useParams();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [branchName, setBranchName] = useState('Sucursal');

  const translateAction = (action) => {
    const actions = {
      'INSERT': 'CREAR',
      'UPDATE': 'EDITAR',
      'DELETE': 'ELIMINAR',
      'LOGIN': 'INGRESO'
    };
    return actions[action] || action;
  };

  const translateDescription = (desc) => {
    if (!desc) return desc;
    let translated = desc;

    const patterns = [
      { regex: /Created new expenses record/i, replacement: 'Nuevo registro de Gasto creado' },
      { regex: /Created new cash_expenses record/i, replacement: 'Nuevo registro de Egreso de Caja creado' },
      { regex: /Deleted (.*) record/i, replacement: 'Registro de $1 eliminado' },
      { regex: /Updated (.*) record/i, replacement: 'Registro de $1 actualizado' },
      { regex: /Created new (.*) record/i, replacement: 'Nuevo registro de $1 creado' },
      { regex: /Cash Expense: (.*) \((.*)\)/i, replacement: 'Egreso CAJA: $1 ($2)' },
      { regex: /Expense: (.*) \((.*)\)/i, replacement: 'Nuevo Egreso CAJA: $1 ($2)' },
      { regex: /UPDATE Product: (.*)/i, replacement: 'Producto EDITADO: $1' },
      { regex: /INSERT Product: (.*)/i, replacement: 'Producto CREADO: $1' },
      { regex: /New Sale: (.*) via (.*)/i, replacement: 'Nueva Venta: $1 vía $2' },
      { regex: /New Sale: (.*)/i, replacement: 'Nueva Venta: $1' },
      { regex: /User logged in/i, replacement: 'Sesión iniciada' }
    ];

    patterns.forEach(({ regex, replacement }) => {
      translated = translated.replace(regex, replacement);
    });

    const terms = {
      'cash_expenses': 'egresos de caja',
      'sales': 'ventas',
      'cash_registers': 'cajas',
      'expenses': 'gastos',
      'transfer': 'transferencia',
      'cash': 'efectivo'
    };

    Object.entries(terms).forEach(([en, es]) => {
      translated = translated.replace(new RegExp(`\\b${en}\\b`, 'g'), es);
    });

    return translated;
  };

  useEffect(() => {
    if (branchId) {
      fetchBranchData();
      fetchLogs();
    }
  }, [branchId]);

  const fetchBranchData = async () => {
    const { data } = await supabase.from('branches').select('name').eq('id', branchId).single();
    if (data) setBranchName(data.name);
  };

  const fetchLogs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('activity_logs')
      .select(`*, profiles:user_id (email, role)`)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error) setLogs(data);
    setLoading(false);
  };

  // ✅ NUEVA FUNCIÓN DE ENVÍO DE EMAIL
  const handleSendTestEmail = async () => {
    setIsSendingEmail(true);
    try {
      // Invocamos la Edge Function de Supabase
      const { data, error } = await supabase.functions.invoke('send-test-email', {
        body: { 
          to: 'puoxxyt27@gmail.com',
          subject: `Prueba de Email - Sucursal ${branchName}`,
          message: 'Este es un correo de prueba enviado desde el sistema de logs.'
        },
      });

      if (error) throw error;

      toast({
        title: "¡Email Enviado!",
        description: "Revisá la casilla puoxxyt27@gmail.com",
      });
    } catch (err) {
      console.error("Error enviando email:", err);
      toast({
        variant: "destructive",
        title: "Error al enviar",
        description: "Asegurate de tener configurada la Edge Function en Supabase.",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registro de Actividad</h1>
          <p className="text-gray-500 text-sm">Auditoría de acciones en el sistema (ART)</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* ✅ BOTÓN DE PRUEBA DE EMAIL */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSendTestEmail} 
            disabled={isSendingEmail}
            className="bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-50"
          >
            {isSendingEmail ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Mail className="w-4 h-4 mr-2" />
            )}
            Probar Email
          </Button>

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
          <div className="p-12 text-center text-gray-400">No hay actividad registrada reciente.</div>
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
                  const userDisplay = isOwner ? log.profiles?.email : branchName;

                  return (
                    <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-full ${isOwner ? 'bg-amber-100' : 'bg-slate-100'}`}>
                            <User className={`w-3.5 h-3.5 ${isOwner ? 'text-amber-600' : 'text-slate-500'}`} />
                          </div>
                          <span className={`font-medium ${isOwner ? 'text-gray-900' : 'text-indigo-600'}`}>
                            {userDisplay || 'Sistema'}
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