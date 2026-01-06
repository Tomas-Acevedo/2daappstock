import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Wallet, Plus, Calendar, Loader2, Clock, Trash2, Lock, Package, CreditCard, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDateTime, getArgentinaDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useOffline } from "@/contexts/OfflineContext";
import { supabase } from '@/lib/customSupabaseClient';
import {
  cacheBranchConfig,
  getBranchConfigOffline,
  upsertLocalCashRegister,
  upsertLocalCashExpense,
  deleteLocalCashExpense,
  getCashDayOffline,
  cacheSalesAndItems,
  enqueueAction,
} from "@/lib/offlineDb";
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
  const { online, syncing } = useOffline();

  const [loading, setLoading] = useState(true);
  const [registerData, setRegisterData] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [cashSales, setCashSales] = useState([]);
  const [branchConfig, setBranchConfig] = useState(null);

  const [selectedDate, setSelectedDate] = useState(getArgentinaDate());
  const [isStartDialogOpen, setIsStartDialogOpen] = useState(false);
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [expenseForm, setExpenseForm] = useState({ amount: 0, description: '', isWithdrawal: false });

  const isOwner = user?.profile?.role === 'owner';
  const canViewHistory = isOwner || branchConfig?.allow_cash_history === true;
  const canDeleteExpense = isOwner || branchConfig?.allow_cash_expense_delete !== false;
  const debounceRef = useRef(null);

  const getDayRange = (dateString) => ({
    start: `${dateString}T00:00:00-03:00`,
    end: `${dateString}T23:59:59.999-03:00`
  });

  const fetchRegisterData = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const { start, end } = getDayRange(selectedDate);

      // 1. Configuración de sucursal
      let config = null;
      if (online) {
        const { data } = await supabase.from('branches').select('allow_cash_history, allow_cash_expense_delete').eq('id', branchId).single();
        if (data) { config = data; await cacheBranchConfig({ id: branchId, ...data }); }
      } else {
        config = await getBranchConfigOffline(branchId);
      }
      setBranchConfig(config);

      // 2. Datos de Caja (Online -> Cache o Offline)
      if (online) {
        const { data: registers } = await supabase.from('cash_registers').select('*').eq('branch_id', branchId).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false });
        const currentRegister = registers?.[0] || null;
        setRegisterData(currentRegister);

        if (currentRegister) {
          await upsertLocalCashRegister(currentRegister);
          const { data: sales } = await supabase.from('sales').select('*, sale_items(*)').eq('branch_id', branchId).ilike('payment_method', '%efectivo%').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false });
          const { data: exp } = await supabase.from('cash_expenses').select('*').eq('branch_id', branchId).gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false });
          
          setCashSales(sales || []);
          setExpenses(exp || []);
          if (sales) await cacheSalesAndItems(sales);
          if (exp) for (const e of exp) await upsertLocalCashExpense(e);
        } else {
          setCashSales([]); setExpenses([]);
        }
      } else {
        const offData = await getCashDayOffline({ branchId, date: selectedDate });
        setRegisterData(offData.register);
        setExpenses(offData.expenses);
        setCashSales(offData.cashSales);
      }
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }, [branchId, selectedDate, online]);

  useEffect(() => { fetchRegisterData(); }, [fetchRegisterData]);

  // Listener para refrescar tras sincronización
  useEffect(() => {
    const h = () => fetchRegisterData();
    window.addEventListener("cash:refresh", h);
    return () => window.removeEventListener("cash:refresh", h);
  }, [fetchRegisterData]);

  useEffect(() => {
    if (!branchId || !online) return;
    const refreshDebounced = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchRegisterData(), 250);
    };
    const ch = supabase.channel(`rt-cash-${branchId}`);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'cash_registers' }, refreshDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_expenses' }, refreshDebounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, refreshDebounced)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [branchId, online, fetchRegisterData]);

  const handleStartRegister = async () => {
    try {
      const timestamp = `${selectedDate}T${new Date().toLocaleTimeString('es-AR', { hour12: false })}-03:00`;
      const payload = { branch_id: branchId, opening_balance: openingBalance, status: 'open', created_at: timestamp };

      if (online) {
        const { data, error } = await supabase.from('cash_registers').insert([payload]).select().single();
        if (error) throw error;
        await upsertLocalCashRegister(data);
      } else {
        const localId = `local-${crypto.randomUUID()}`;
        await upsertLocalCashRegister({ id: localId, ...payload });
        await enqueueAction({ type: "cash_register:create", payload: { ...payload, _local_id: localId } });
        toast({ title: "Caja abierta (offline)" });
      }
      setIsStartDialogOpen(false); fetchRegisterData();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  const handleAddExpense = async () => {
    if (expenseForm.amount <= 0 || !expenseForm.description) return toast({ title: "Completa los campos", variant: "destructive" });
    try {
      const timestamp = `${selectedDate}T${new Date().toLocaleTimeString('es-AR', { hour12: false })}-03:00`;
      const desc = expenseForm.isWithdrawal ? `RETIRO: ${expenseForm.description}` : expenseForm.description;
      const payload = { branch_id: branchId, amount: expenseForm.amount, description: desc, created_at: timestamp };

      if (online) {
        const { data, error } = await supabase.from('cash_expenses').insert([payload]).select().single();
        if (error) throw error;
        await upsertLocalCashExpense(data);
        if (!expenseForm.isWithdrawal) {
          await supabase.from('expenses').insert([{ branch_id: branchId, name: `[CAJA] ${expenseForm.description}`, amount: Number(expenseForm.amount), currency: 'ARS', payment_method: 'Efectivo', date: timestamp }]);
        }
      } else {
        const localId = `local-${crypto.randomUUID()}`;
        await upsertLocalCashExpense({ id: localId, ...payload });
        await enqueueAction({ type: "cash_expense:create", payload: { ...payload, _local_id: localId } });
        if (!expenseForm.isWithdrawal) {
          await enqueueAction({ type: "expense:create", payload: { branch_id: branchId, name: `[CAJA] ${expenseForm.description}`, amount: Number(expenseForm.amount), currency: 'ARS', payment_method: 'Efectivo', date: timestamp } });
        }
        toast({ title: "Registrado (offline)" });
      }
      setIsExpenseDialogOpen(false); setExpenseForm({ amount: 0, description: '', isWithdrawal: false }); fetchRegisterData();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  const handleDeleteExpense = async (id) => {
    if (!isOwner && branchConfig?.allow_cash_expense_delete === false) return toast({ title: "Acceso denegado", variant: "destructive" });
    if (!window.confirm("¿Seguro?")) return;
    
    await deleteLocalCashExpense(id);
    if (String(id).startsWith("local-")) {
      fetchRegisterData(); return;
    }

    if (online) {
      await supabase.from('cash_expenses').delete().eq('id', id);
    } else {
      await enqueueAction({ type: "cash_expense:delete", payload: { id } });
      toast({ title: "Eliminado (offline)" });
    }
    fetchRegisterData();
  };

  const totalSales = cashSales.reduce((acc, sale) => acc + Number(sale.total), 0);
  const totalExpenses = expenses.reduce((acc, exp) => acc + Number(exp.amount), 0);
  const currentTotal = registerData ? (Number(registerData.opening_balance) + totalSales - totalExpenses) : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto pb-10 px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg"><Wallet className="w-6 h-6 text-white" /></div>
          <h1 className="text-2xl font-bold text-gray-900">Caja</h1>
        </div>
        {canViewHistory ? (
          <div className="flex items-center gap-2 bg-white border border-gray-200 p-2 rounded-xl shadow-sm">
            <Calendar className="w-4 h-4 text-indigo-600 ml-2" />
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border-none outline-none tabular-nums text-sm font-semibold" />
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 p-2.5 rounded-xl text-indigo-600">
            <Clock className="w-4 h-4" /><span className="text-sm font-bold uppercase">Jornada Actual</span>
          </div>
        )}
      </div>

      {!registerData && !loading ? (
        <div className="bg-white rounded-xl p-12 border border-gray-200 text-center shadow-sm">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No hay registros</h2>
          {(selectedDate === getArgentinaDate() || isOwner) ? (
            <Button onClick={() => setIsStartDialogOpen(true)} className="bg-green-600 mt-4">Abrir Caja</Button>
          ) : <p className="text-amber-600 font-medium mt-4">Solo puedes operar la caja actual.</p>}
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
                <div className="text-sm flex justify-between">
                  <span>Inicio:</span><span className="font-bold">{formatCurrency(registerData?.opening_balance || 0)}</span>
                </div>
                <div className="text-xs pt-2 border-t flex justify-between uppercase">
                  <span>Apertura:</span><span>{registerData ? formatDateTime(registerData.created_at).split(',')[1] : '--:--'}</span>
                </div>
              </div>
            </div>
          </div>

          <Button onClick={() => setIsExpenseDialogOpen(true)} disabled={syncing} className="bg-red-600">
            <Plus className="w-4 h-4 mr-2 rotate-45" /> Registrar Egreso
          </Button>

          {/* TABLA VENTAS */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden tabular-nums">
            <div className="p-4 border-b bg-gray-50/50 flex justify-between items-center">
              <h3 className="font-semibold text-green-600 text-sm uppercase tracking-wider">Ventas en Efectivo</h3>
              <span className="font-bold text-lg">{formatCurrency(totalSales)}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {cashSales.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Sin ventas</div>
              ) : cashSales.map(sale => (
                <div key={sale.id} className="p-5 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div className="space-y-1.5 flex-1">
                      <p className="font-bold text-gray-900 leading-none">{sale.customer_name === 'Cliente General' ? 'Venta Mostrador' : sale.customer_name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400 uppercase font-medium">{formatDateTime(sale.created_at).split(',')[1]} hs</span>
                        <div className="flex items-center gap-1 bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-100">
                          <CreditCard className="w-3 h-3" />
                          <span className="text-[10px] font-black uppercase tracking-tight">{sale.payment_method}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-xl font-black text-green-600">+{formatCurrency(sale.total)}</span>
                  </div>
                  <div className="bg-gray-50/50 rounded-lg p-3 border border-gray-100 mt-2">
                    <div className="space-y-1.5">
                      {sale.sale_items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] font-bold">{item.quantity}x</span>
                            <span className="text-gray-700 font-medium">{item.product_name || "Producto Personalizado"}</span>
                          </div>
                          <span className="text-gray-500 font-semibold text-xs italic">{formatCurrency(item.unit_price * item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TABLA EGRESOS */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden tabular-nums">
            <div className="p-4 border-b bg-gray-50/50 flex justify-between items-center">
              <h3 className="font-semibold text-red-600 text-sm uppercase tracking-wider">Egresos de Caja</h3>
              <span className="font-bold text-lg">{formatCurrency(totalExpenses)}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {expenses.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Sin egresos</div>
              ) : expenses.map(expense => (
                <div key={expense.id} className="p-4 flex justify-between items-center hover:bg-red-50/30">
                  <div>
                    <p className="font-bold text-gray-900">{expense.description}</p>
                    <p className="text-[11px] text-gray-400 font-medium uppercase">{formatDateTime(expense.created_at).split(',')[1]} hs</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-black text-red-600">-{formatCurrency(expense.amount)}</span>
                    {canDeleteExpense ? (
                      <button onClick={() => handleDeleteExpense(expense.id)} className="p-2 text-gray-300 hover:text-red-600 hover:bg-white rounded-lg border border-transparent hover:border-red-100 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : <div className="p-2 text-gray-300 bg-gray-50 rounded-lg"><Lock className="w-4 h-4" /></div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* DIALOGS */}
      <Dialog open={isStartDialogOpen} onOpenChange={setIsStartDialogOpen}>
        <DialogContent className="bg-white rounded-2xl">
          <DialogHeader><DialogTitle className="text-xl font-bold">Abrir Caja</DialogTitle></DialogHeader>
          <div className="py-4 space-y-2">
            <label className="text-xs font-black uppercase text-gray-400">Monto Inicial</label>
            <Input type="number" value={openingBalance} onFocus={e => e.target.select()} onChange={(e) => setOpeningBalance(Number(e.target.value))} className="h-12 rounded-xl text-lg font-bold" />
          </div>
          <DialogFooter><Button onClick={handleStartRegister} className="w-full h-12 bg-green-600 text-white font-black uppercase text-xs rounded-xl">Iniciar Jornada</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
        <DialogContent className="bg-white rounded-2xl">
          <DialogHeader><DialogTitle className="text-xl font-bold">Nuevo Egreso</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setExpenseForm({ ...expenseForm, isWithdrawal: false })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${!expenseForm.isWithdrawal ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>GASTO</button>
              <button onClick={() => setExpenseForm({ ...expenseForm, isWithdrawal: true })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${expenseForm.isWithdrawal ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>RETIRO</button>
            </div>
            <div className={`p-3 rounded-xl border flex gap-3 items-start ${expenseForm.isWithdrawal ? 'bg-amber-50 border-amber-100 text-amber-800' : 'bg-indigo-50 border-indigo-100 text-indigo-800'}`}>
              <Info className="w-5 h-5 mt-0.5 shrink-0" />
              <p className="text-xs font-medium">{expenseForm.isWithdrawal ? "Este retiro no se registrará como gasto, solo afectará el saldo de caja." : "Este gasto afectará el reporte de caja y el módulo de gastos general."}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-gray-400">Descripción</label>
              <Input placeholder="Ej: Pago de flete" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} className="h-12 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-gray-400">Monto</label>
              <Input type="number" value={expenseForm.amount} onFocus={e => e.target.select()} onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })} className="h-12 rounded-xl font-bold text-red-600" />
            </div>
          </div>
          <DialogFooter><Button onClick={handleAddExpense} className={`w-full h-12 text-white font-black uppercase text-xs rounded-xl ${expenseForm.isWithdrawal ? 'bg-amber-600' : 'bg-red-600'}`}>Confirmar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default CashRegister;