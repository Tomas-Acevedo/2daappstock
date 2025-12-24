import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  TrendingUp, Users, DollarSign, ShoppingBag, 
  Calendar as CalendarIcon, Clock, CreditCard,
  Trash2, ChevronLeft, ChevronRight
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { formatCurrency, formatDateTime, getArgentinaDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

// ✅ TABLA ACTUALIZADA: Sin botón de impresión
const SalesTable = ({ sales, loading, onDelete, paymentMethods }) => {
  if (loading) {
    return <div className="text-center p-10 text-lg text-gray-400 font-medium">Cargando ventas...</div>;
  }

  if (sales.length === 0) {
    return (
      <div className="text-center p-12 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-500 text-lg">
        No se encontraron ventas para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-100 border-b-2 border-gray-200 text-gray-700">
            <tr>
              <th className="px-6 py-5 text-xs font-black uppercase tracking-widest">Fecha / Hora</th>
              <th className="px-6 py-5 text-xs font-black uppercase tracking-widest">Cliente</th>
              <th className="px-6 py-5 text-xs font-black uppercase tracking-widest">Detalle Compra</th>
              <th className="px-6 py-5 text-xs font-black uppercase tracking-widest">Método</th>
              <th className="px-6 py-5 text-right text-xs font-black uppercase tracking-widest">Total</th>
              <th className="px-6 py-5 text-center text-xs font-black uppercase tracking-widest">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sales.map((sale) => (
              <tr key={sale.id} className="hover:bg-indigo-50/40 transition-colors">
                <td className="px-6 py-6 whitespace-nowrap align-top">
                  <div className="text-base font-bold text-gray-900">{formatDateTime(sale.created_at).split(',')[0]}</div>
                  <div className="text-sm text-gray-500 font-medium">{formatDateTime(sale.created_at).split(',')[1]}</div>
                </td>
                <td className="px-6 py-6 text-base font-bold text-gray-900 align-top">
                  {sale.customer_name || "Cliente General"}
                </td>
                <td className="px-6 py-6 align-top">
                  <div className="flex flex-col gap-2">
                    {sale.sale_items?.map((item, idx) => (
                      <span key={idx} className="text-sm text-gray-800 font-bold max-w-[350px] flex items-start gap-2">
                        <span className="text-indigo-600 font-black min-w-[25px]">{item.quantity}x</span> 
                        <span className="flex-1">{item.product_name}</span>
                        <span className="text-gray-400 font-semibold text-xs whitespace-nowrap">({formatCurrency(item.unit_price)})</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-6 align-top">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm">
                      {sale.payment_method}
                    </span>
                    {(() => {
                      const method = paymentMethods.find(m => m.name === sale.payment_method);
                      if (method && Number(method.discount_percentage) > 0) {
                        return (
                          <span className="text-[10px] bg-green-500 text-white px-2 py-0.5 rounded-full font-black">
                            -{method.discount_percentage}%
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </td>
                <td className="px-6 py-6 text-right text-xl font-black text-gray-900 tracking-tighter align-top">
                  {formatCurrency(sale.total)}
                </td>
                <td className="px-6 py-6 align-top">
                  <div className="flex items-center justify-center gap-3">
                    <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-gray-200 hover:bg-red-50 hover:text-red-600 transition-all" onClick={() => onDelete(sale)}>
                      <Trash2 className="w-5 h-5 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const DashboardHome = () => {
  const { branchId } = useParams();
  
  const [metrics, setMetrics] = useState({ periodSales: 0, orderCount: 0, customerCount: 0, averageSale: 0 });
  const [salesData, setSalesData] = useState([]);
  const [dateRange, setDateRange] = useState({ start: getArgentinaDate(), end: getArgentinaDate() });
  const [timeRange, setTimeRange] = useState({ start: '00:00', end: '23:59' });
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('all');
  const [availableMethods, setAvailableMethods] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPaymentMethods();
  }, [branchId]);

  useEffect(() => {
    fetchDashboardData();
  }, [branchId, dateRange, timeRange, selectedPaymentMethod]);

  const fetchPaymentMethods = async () => {
    const { data } = await supabase.from('payment_methods').select('id, name, discount_percentage').eq('branch_id', branchId).eq('is_active', true);
    if (data) setAvailableMethods(data);
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('sales')
        .select(`*, sale_items (product_id, quantity, product_name, unit_price)`)
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false });
      
      const startDateTime = `${dateRange.start}T${timeRange.start}:00-03:00`; 
      const endDateTime = `${dateRange.end}T${timeRange.end}:59-03:00`;
      query = query.gte('created_at', startDateTime).lte('created_at', endDateTime);

      if (selectedPaymentMethod !== 'all') {
        query = query.eq('payment_method', selectedPaymentMethod);
      }

      const { data, error } = await query;
      if (error) throw error;

      setSalesData(data || []);

      const salesTotal = data.reduce((acc, sale) => acc + Number(sale.total), 0);
      const uniqueCustomers = new Set(data.map(s => s.customer_name)).size;
      setMetrics({
        periodSales: salesTotal,
        orderCount: data.length,
        customerCount: uniqueCustomers,
        averageSale: data.length > 0 ? salesTotal / data.length : 0
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      toast({ title: "Error al cargar datos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSale = async (sale) => {
    if (!window.confirm("¿Seguro que deseas eliminar esta venta? El stock será restaurado.")) return;
    try {
      if (sale.sale_items && sale.sale_items.length > 0) {
        for (const item of sale.sale_items) {
           if (item.product_id) {
             const { data: currentProd, error: prodError } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
             if (!prodError && currentProd) {
               await supabase.from('products').update({ stock: currentProd.stock + item.quantity }).eq('id', item.product_id);
             }
           }
        }
      }
      const { error } = await supabase.from('sales').delete().eq('id', sale.id);
      if (error) throw error;
      toast({ title: "Venta eliminada y stock restaurado" });
      fetchDashboardData(); 
    } catch (error) {
      toast({ title: "Error al eliminar venta", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          <div className="space-y-1 w-full md:w-auto">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> Fechas</label>
            <div className="flex gap-2 items-center">
              <input type="date" className="border p-2 rounded-md text-sm w-full" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} />
              <input type="date" className="border p-2 rounded-md text-sm w-full" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} />
            </div>
          </div>
          <div className="space-y-1 w-full md:w-auto">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Clock className="w-3 h-3" /> Horario</label>
            <div className="flex gap-2 items-center">
              <input type="time" className="border p-2 rounded-md text-sm w-24" value={timeRange.start} onChange={e => setTimeRange({...timeRange, start: e.target.value})} />
              <input type="time" className="border p-2 rounded-md text-sm w-24" value={timeRange.end} onChange={e => setTimeRange({...timeRange, end: e.target.value})} />
            </div>
          </div>
          <div className="space-y-1 w-full md:w-auto flex-1">
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><CreditCard className="w-3 h-3" /> Método de Pago</label>
            <select className="w-full border p-2 rounded-md text-sm bg-white" value={selectedPaymentMethod} onChange={e => setSelectedPaymentMethod(e.target.value)}>
              <option value="all">Todos los métodos</option>
              {availableMethods.map(method => (<option key={method.id} value={method.name}>{method.name}</option>))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { title: "Ventas (Periodo)", value: formatCurrency(metrics.periodSales), desc: "Total facturado en rango", icon: DollarSign, color: "text-green-600" },
          { title: "Transacciones", value: metrics.orderCount, desc: "Ventas realizadas", icon: ShoppingBag, color: "text-indigo-600" },
          { title: "Promedio por Venta", value: formatCurrency(metrics.averageSale), desc: "Ticket promedio", icon: TrendingUp, color: "text-blue-600" },
          { title: "Clientes Únicos", value: metrics.customerCount, desc: "En el periodo seleccionado", icon: Users, color: "text-orange-600" }
        ].map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * (i+1) }}>
            <Card className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-gray-500">{item.title}</CardTitle>
                <item.icon className={`h-5 w-5 ${item.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-gray-900">{loading ? "..." : item.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <SalesTable 
        sales={salesData} 
        loading={loading} 
        onDelete={handleDeleteSale} 
        paymentMethods={availableMethods}
      />
    </div>
  );
};

export default DashboardHome;