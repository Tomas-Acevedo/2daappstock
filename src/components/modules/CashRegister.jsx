import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet, Plus, Minus, Calendar, DollarSign, Trash2, AlertCircle, Loader2, Clock, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
// Importamos getArgentinaDate para solucionar el error de las 21:00hs
import { formatCurrency, formatDateTime, getArgentinaDate } from '@/lib/utils';
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
  const [loading, setLoading] = useState(true);
  const [registerData, setRegisterData] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [cashSales, setCashSales] = useState([]);
  
  // ✅ SOLUCIÓN AL ERROR DE LAS 21:00: Usamos getArgentinaDate() en lugar de toISOString()
  const [selectedDate, setSelectedDate] = useState(getArgentinaDate());
  
  const [isStartDialogOpen, setIsStartDialogOpen] = useState(false);
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  
  const [openingBalance, setOpeningBalance] = useState(0);
  const [expenseForm, setExpenseForm] = useState({ amount: 0, description: '' });

  const getDayRange = (dateString) => {
    return {
      start: `${dateString}T00:00:00-03:00`,
      end: `${dateString}T23:59:59.999-03:00`
    };
  };

  useEffect(() => {
    if (branchId) {
      fetchRegisterData();
    }
  }, [branchId, selectedDate]);

  const fetchRegisterData = async () => {
    setLoading(true);
    try {
      const { start, end } = getDayRange(selectedDate);

      const { data: registers, error: regError } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('branch_id', branchId)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false });

      if (regError) throw regError;
      
      const currentRegister = registers && registers.length > 0 ? registers[0] : null;
      setRegisterData(currentRegister);

      if (currentRegister) {
        const { data: sales, error: salesError } = await supabase
          .from('sales')
          .select('*, sale_items(product_name, quantity)')
          .eq('branch_id', branchId)
          .ilike('payment_method', '%efectivo%') 
          .gte('created_at', start)
          .lte('created_at', end)
          .order('created_at', { ascending: false });

        if (salesError) throw salesError;
        setCashSales(sales);

        const { data: exp, error: expError } = await supabase
          .from('cash_expenses')
          .select('*')
          .eq('branch_id', branchId)
          .gte('created_at', start)
          .lte('created_at', end)
          .order('created_at', { ascending: false });
        
        if (expError) throw expError;
        setExpenses(exp);
      } else {
        setCashSales([]);
        setExpenses([]);
      }

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: "Error cargando datos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleStartRegister = async () => {
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('es-AR', { hour12: false });
      const timestamp = `${selectedDate}T${timeStr}-03:00`;

      const { error } = await supabase
        .from('cash_registers')
        .insert([{
          branch_id: branchId,
          opening_balance: openingBalance,
          status: 'open',
          created_at: timestamp 
        }]);

      if (error) throw error;
      toast({ title: "Caja iniciada" });
      setIsStartDialogOpen(false);
      fetchRegisterData();
    } catch (error) {
      toast({ title: "Error al iniciar caja", variant: "destructive" });
    }
  };

  const handleAddExpense = async () => {
    if (!expenseForm.description || expenseForm.amount <= 0) return;
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('es-AR', { hour12: false });
      const timestamp = `${selectedDate}T${timeStr}-03:00`;

      const { error } = await supabase
        .from('cash_expenses')
        .insert([{
          branch_id: branchId,
          amount: expenseForm.amount,
          description: expenseForm.description,
          created_at: timestamp 
        }]);

      if (error) throw error;
      toast({ title: "Egreso registrado" });
      setIsExpenseDialogOpen(false);
      setExpenseForm({ amount: 0, description: '' });
      fetchRegisterData();
    } catch (error) {
      toast({ title: "Error registrando egreso", variant: "destructive" });
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm("¿Seguro que desea eliminar este egreso?")) return;
    try {
      const { error } = await supabase.from('cash_expenses').delete().eq('id', id);
      if (error) throw error;
      toast({ title: "Egreso eliminado" });
      fetchRegisterData();
    } catch (error) {
      toast({ title: "Error al eliminar", variant: "destructive" });
    }
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
        
        <div className="flex items-center gap-2 bg-white border border-gray-200 p-2 rounded-xl shadow-sm">
          <Calendar className="w-4 h-4 text-indigo-600 ml-2" />
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border-none focus:ring-0 text-sm font-semibold text-gray-700 outline-none tabular-nums"
          />
        </div>
      </div>

      {!registerData && !loading ? (
        <div className="bg-white rounded-xl p-12 border border-gray-200 text-center shadow-sm">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No hay registros para este día</h2>
          <p className="text-gray-500 mb-6">¿Deseas abrir una nueva sesión de caja para esta fecha?</p>
          <Button onClick={() => setIsStartDialogOpen(true)} className="bg-green-600 hover:bg-green-700">
            Abrir Caja en {selectedDate}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200 relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-1">Total en Caja</h3>
                <div className="h-14 flex items-center">
                  {loading ? (
                    <div className="flex items-center gap-2 text-gray-300">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span className="text-lg font-medium">Calculando...</span>
                    </div>
                  ) : (
                    <div className="text-5xl font-bold text-gray-900 tracking-tight">
                      {formatCurrency(currentTotal)}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 bg-gray-50 p-4 rounded-xl border border-gray-100 min-w-[240px]">
                <div className="text-sm text-gray-600 font-medium flex items-center justify-between">
                  <span className="flex items-center gap-2 tabular-nums"><Plus className="w-4 h-4 text-green-600" /> Inicio:</span>
                  <span className="text-gray-900 font-bold">{formatCurrency(registerData?.opening_balance || 0)}</span>
                </div>
                <div className="text-xs text-gray-500 flex items-center justify-between pt-2 border-t border-gray-200">
                  <span className="flex items-center gap-2 tabular-nums"><Clock className="w-3.5 h-3.5 text-indigo-500" /> Apertura:</span>
                  <span className="font-medium text-gray-900 uppercase">
                    {registerData ? (
                        formatDateTime(registerData.created_at).includes(',') 
                        ? formatDateTime(registerData.created_at).split(',')[1].trim()
                        : formatDateTime(registerData.created_at).split(' ')[1]
                    ) : '--:--'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Button onClick={() => setIsExpenseDialogOpen(true)} className="bg-red-600 hover:bg-red-700">
            <Minus className="w-4 h-4 mr-2" /> Registrar Egreso
          </Button>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <h3 className="font-semibold text-green-600 flex items-center gap-2 text-sm uppercase tracking-wider">
                <DollarSign className="w-4 h-4" /> Ventas en Efectivo
              </h3>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(totalSales)}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {loading ? (
                <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500" /></div>
              ) : cashSales.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">Sin ventas registradas</div>
              ) : (
                cashSales.map(sale => (
                  <div key={sale.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">
                          {sale.customer_name === 'Cliente General' ? 'Venta de Mostrador' : sale.customer_name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-indigo-100">
                            {sale.payment_method}
                          </span>
                          <span className="text-[11px] text-gray-400 flex items-center gap-1 tabular-nums">
                            <Clock className="w-3 h-3" /> 
                            {formatDateTime(sale.created_at).includes(',') 
                              ? formatDateTime(sale.created_at).split(',')[1].trim()
                              : formatDateTime(sale.created_at).split(' ')[1]}
                          </span>
                        </div>
                      </div>
                      <span className="text-base font-bold text-green-600">+{formatCurrency(sale.total)}</span>
                    </div>
                    <div className="ml-1 space-y-1">
                      {sale.sale_items?.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs text-gray-500">
                          <Package className="w-3 h-3 text-gray-400" />
                          <span>{item.quantity}x {item.product_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <h3 className="font-semibold text-red-600 flex items-center gap-2 text-sm uppercase tracking-wider">
                <AlertCircle className="w-4 h-4" /> Egresos de Caja
              </h3>
              <span className="text-sm font-bold text-gray-900">{formatCurrency(totalExpenses)}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {loading ? (
                <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-red-500" /></div>
              ) : expenses.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">Sin egresos registrados</div>
              ) : (
                expenses.map(expense => (
                  <div key={expense.id} className="p-4 flex justify-between items-center group">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{expense.description}</p>
                      <p className="text-[11px] text-gray-400 flex items-center gap-1 tabular-nums">
                        <Clock className="w-3 h-3" /> 
                        {formatDateTime(expense.created_at).includes(',') 
                          ? formatDateTime(expense.created_at).split(',')[1].trim()
                          : formatDateTime(expense.created_at).split(' ')[1]}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-red-600">-{formatCurrency(expense.amount)}</span>
                      <button onClick={() => handleDeleteExpense(expense.id)} className="text-gray-300 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Diálogos */}
      <Dialog open={isStartDialogOpen} onOpenChange={setIsStartDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle>Abrir Caja - {selectedDate}</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Monto Inicial en Efectivo</label>
              <input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(Number(e.target.value))} className="w-full border p-2 rounded-md outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStartDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleStartRegister} className="bg-green-600 text-white">Iniciar Jornada</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle>Nuevo Egreso de Efectivo</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Concepto / Descripción</label>
              <input value={expenseForm.description} onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})} className="w-full border p-2 rounded-md outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Ej. Insumos limpieza, Pago flete" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Monto a retirar</label>
              <input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm({...expenseForm, amount: Number(e.target.value)})} className="w-full border p-2 rounded-md outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExpenseDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddExpense} className="bg-red-600 text-white">Confirmar Egreso</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default CashRegister;