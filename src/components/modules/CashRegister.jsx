import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet, Plus, Minus, Calendar, DollarSign, Trash2, AlertCircle, Loader2, Clock, Package, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // ✅ ESTA IMPORTACIÓN FALTABA
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDateTime, getArgentinaDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const CashRegister = () => {
  const { branchId } = useParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [registerData, setRegisterData] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [cashSales, setCashSales] = useState([]);
  const [branchConfig, setBranchConfig] = useState(null);
  
  const [selectedDate, setSelectedDate] = useState(getArgentinaDate());
  const [isStartDialogOpen, setIsStartDialogOpen] = useState(false);
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [expenseForm, setExpenseForm] = useState({ amount: 0, description: '' });

  const formatDateDMY = (dateStr) => {
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
};


  const getDayRange = (dateString) => {
    return {
      start: `${dateString}T00:00:00-03:00`,
      end: `${dateString}T23:59:59.999-03:00`
    };
  };

  useEffect(() => {
    if (branchId) fetchRegisterData();
  }, [branchId, selectedDate]);

  const fetchRegisterData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDayRange(selectedDate);
      const { data: config } = await supabase.from('branches').select('allow_cash_history').eq('id', branchId).single();
      setBranchConfig(config);

      const { data: registers } = await supabase.from('cash_registers').select('*').eq('branch_id', branchId).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false });
      const currentRegister = registers && registers.length > 0 ? registers[0] : null;
      setRegisterData(currentRegister);

      if (currentRegister) {
        const { data: sales } = await supabase.from('sales').select('*, sale_items(product_name, quantity)').eq('branch_id', branchId).ilike('payment_method', '%efectivo%').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false });
        setCashSales(sales || []);
        const { data: exp } = await supabase.from('cash_expenses').select('*').eq('branch_id', branchId).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false });
        setExpenses(exp || []);
      } else {
        setCashSales([]);
        setExpenses([]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const isOwner = user?.profile?.role === 'owner';
  const canViewHistory = isOwner || branchConfig?.allow_cash_history === true;

  const handleStartRegister = async () => {
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('es-AR', { hour12: false });
      const timestamp = `${selectedDate}T${timeStr}-03:00`;
      await supabase.from('cash_registers').insert([{ branch_id: branchId, opening_balance: openingBalance, status: 'open', created_at: timestamp }]);
      setIsStartDialogOpen(false);
      fetchRegisterData();
    } catch (e) { toast({ title: "Error" }); }
  };

  const handleAddExpense = async () => {
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('es-AR', { hour12: false });
      const timestamp = `${selectedDate}T${timeStr}-03:00`;
      await supabase.from('cash_expenses').insert([{ branch_id: branchId, amount: expenseForm.amount, description: expenseForm.description, created_at: timestamp }]);
      setIsExpenseDialogOpen(false);
      setExpenseForm({ amount: 0, description: '' });
      fetchRegisterData();
    } catch (e) { toast({ title: "Error" }); }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm("¿Seguro que desea eliminar este egreso?")) return;
    await supabase.from('cash_expenses').delete().eq('id', id);
    fetchRegisterData();
  };

  const totalSales = cashSales.reduce((acc, sale) => acc + Number(sale.total), 0);
  const totalExpenses = expenses.reduce((acc, exp) => acc + Number(exp.amount), 0);
  const currentTotal = registerData ? (Number(registerData.opening_balance) + totalSales - totalExpenses) : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto pb-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg"><Wallet className="w-6 h-6 text-white" /></div>
          <h1 className="text-2xl font-bold text-gray-900">Caja</h1>
        </div>
        
        {canViewHistory ? (
          <div className="flex items-center gap-2 bg-white border border-gray-200 p-2 rounded-xl shadow-sm">
            <Calendar className="w-4 h-4 text-indigo-600 ml-2" />
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border-none focus:ring-0 text-sm font-semibold outline-none tabular-nums" />
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 p-2.5 rounded-xl text-indigo-600">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-bold uppercase">
  Jornada Actual ({formatDateDMY(selectedDate)})
</span>

          </div>
        )}
      </div>

      {!registerData && !loading ? (
        <div className="bg-white rounded-xl p-12 border border-gray-200 text-center shadow-sm">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No hay registros para este día</h2>
          {(selectedDate === getArgentinaDate() || isOwner) ? (
            <Button onClick={() => setIsStartDialogOpen(true)} className="bg-green-600 mt-4">
  {formatDateDMY(selectedDate)} Abrir Caja
</Button>

          ) : <p className="text-amber-600 font-medium mt-4">Solo puedes operar la caja del día actual.</p>}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 relative overflow-hidden">
             <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Total en Caja</h3>
                <div className="h-14 flex items-center">
                  {loading ? <Loader2 className="w-8 h-8 animate-spin text-gray-300" /> : <div className="text-5xl font-bold text-gray-900 tracking-tight">{formatCurrency(currentTotal)}</div>}
                </div>
              </div>
              <div className="flex flex-col gap-2 bg-gray-50 p-4 rounded-xl border border-gray-100 min-w-[240px]">
                <div className="text-sm flex justify-between"><span>Inicio:</span><span className="font-bold">{formatCurrency(registerData?.opening_balance || 0)}</span></div>
                <div className="text-xs pt-2 border-t flex justify-between uppercase"><span>Apertura:</span><span>{registerData ? formatDateTime(registerData.created_at).split(',')[1] : '--:--'}</span></div>
              </div>
            </div>
          </div>

          <Button onClick={() => setIsExpenseDialogOpen(true)} className="bg-red-600"><Minus className="w-4 h-4 mr-2" /> Registrar Egreso</Button>

          {/* Listado de Ventas */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden tabular-nums">
            <div className="p-4 border-b bg-gray-50/50 flex justify-between items-center">
              <h3 className="font-semibold text-green-600 text-sm uppercase tracking-wider">Ventas en Efectivo</h3>
              <span className="font-bold">{formatCurrency(totalSales)}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {cashSales.length === 0 ? <div className="p-8 text-center text-gray-400">Sin ventas registradas</div> : 
               cashSales.map(sale => (
                <div key={sale.id} className="p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div><p className="font-bold text-sm">{sale.customer_name === 'Cliente General' ? 'Venta Mostrador' : sale.customer_name}</p><span className="text-[11px] text-gray-400 uppercase">{formatDateTime(sale.created_at).split(',')[1]}</span></div>
                    <span className="text-base font-bold text-green-600">+{formatCurrency(sale.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Egresos */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden tabular-nums">
            <div className="p-4 border-b bg-gray-50/50 flex justify-between items-center">
              <h3 className="font-semibold text-red-600 text-sm uppercase tracking-wider">Egresos de Caja</h3>
              <span className="font-bold">{formatCurrency(totalExpenses)}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {expenses.map(expense => (
                <div key={expense.id} className="p-4 flex justify-between items-center">
                  <div><p className="font-medium text-sm">{expense.description}</p><p className="text-[11px] text-gray-400">{formatDateTime(expense.created_at).split(',')[1]}</p></div>
                  <div className="flex items-center gap-4"><span className="font-bold text-red-600">-{formatCurrency(expense.amount)}</span><button onClick={() => handleDeleteExpense(expense.id)} className="text-gray-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Diálogos */}
      <Dialog open={isStartDialogOpen} onOpenChange={setIsStartDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle>Abrir Caja</DialogTitle></DialogHeader>
          <div className="py-4"><label className="text-sm font-medium">Monto Inicial</label><Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(Number(e.target.value))} /></div>
          <DialogFooter><Button onClick={handleStartRegister} className="bg-green-600 text-white">Iniciar Jornada</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle>Nuevo Egreso</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <div><label className="text-sm font-medium">Descripción</label><Input value={expenseForm.description} onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})} /></div>
            <div><label className="text-sm font-medium">Monto</label><Input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm({...expenseForm, amount: Number(e.target.value)})} /></div>
          </div>
          <DialogFooter><Button onClick={handleAddExpense} className="bg-red-600 text-white">Confirmar Egreso</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default CashRegister;