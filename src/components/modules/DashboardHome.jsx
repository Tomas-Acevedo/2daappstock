
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  TrendingUp, Users, DollarSign, ShoppingBag, 
  Calendar as CalendarIcon, Clock, Filter, CreditCard,
  Trash2, Eye, Receipt, ChevronLeft, ChevronRight
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { formatCurrency, formatDateTime, getArgentinaDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const SalesTable = ({ sales, loading, onDelete, onPrint }) => {
  if (loading) {
    return <div className="text-center p-10 text-gray-400">Cargando ventas...</div>;
  }

  if (sales.length === 0) {
    return (
      <div className="text-center p-10 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-400">
        No se encontraron ventas para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
            <tr>
              <th className="px-6 py-4">Fecha / Hora</th>
              <th className="px-6 py-4">Cliente</th>
              <th className="px-6 py-4">Detalle Compra</th>
              <th className="px-6 py-4">Método</th>
              <th className="px-6 py-4 text-right">Total</th>
              <th className="px-6 py-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sales.map((sale) => (
              <tr key={sale.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                  <div className="font-medium text-gray-900">{formatDateTime(sale.created_at).split(',')[0]}</div>
                  <div className="text-xs">{formatDateTime(sale.created_at).split(',')[1]}</div>
                </td>
                <td className="px-6 py-4 font-medium text-gray-900">{sale.customer_name || "Cliente General"}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    {sale.sale_items?.slice(0, 2).map((item, idx) => (
                      <span key={idx} className="text-xs text-gray-600 max-w-[200px] truncate">
                        {item.quantity}x {item.product_name}
                      </span>
                    ))}
                    {sale.sale_items?.length > 2 && (
                      <span className="text-xs text-indigo-500 italic">
                        +{sale.sale_items.length - 2} más...
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 rounded text-xs font-bold capitalize bg-gray-100 text-gray-700">
                    {sale.payment_method}
                  </span>
                </td>
                <td className="px-6 py-4 text-right font-bold text-gray-900">{formatCurrency(sale.total)}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onPrint(sale)} title="Imprimir Ticket">
                      <Receipt className="w-4 h-4 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(sale)} title="Eliminar Venta">
                      <Trash2 className="w-4 h-4 text-red-500" />
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
  
  // States
  const [metrics, setMetrics] = useState({ periodSales: 0, orderCount: 0, customerCount: 0, averageTicket: 0 });
  const [salesData, setSalesData] = useState([]);
  const [dateRange, setDateRange] = useState({ start: getArgentinaDate(), end: getArgentinaDate() });
  const [timeRange, setTimeRange] = useState({ start: '00:00', end: '23:59' });
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('all');
  const [availableMethods, setAvailableMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branchDetails, setBranchDetails] = useState(null);

  useEffect(() => {
    fetchBranchDetails();
    fetchPaymentMethods();
  }, [branchId]);

  useEffect(() => {
    fetchDashboardData();
  }, [branchId, dateRange, timeRange, selectedPaymentMethod]);

  const fetchBranchDetails = async () => {
    const { data } = await supabase.from('branches').select('name').eq('id', branchId).single();
    if (data) setBranchDetails(data);
  };

  const fetchPaymentMethods = async () => {
    const { data } = await supabase.from('payment_methods').select('*').eq('branch_id', branchId).eq('is_active', true);
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
        averageTicket: data.length > 0 ? salesTotal / data.length : 0
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
      fetchDashboardData(); // Refresh data
    } catch (error) {
      toast({ title: "Error al eliminar venta", variant: "destructive" });
    }
  };
  
  const printTicket = (sale) => {
    const ticketContent = `
      <html><head><title>Ticket</title><style>body{font-family:'Courier New',monospace;font-size:12px;max-width:300px;margin:0 auto;padding:10px}h3,p{margin:0}.header{text-align:center;margin-bottom:10px}.divider{border-top:1px dashed #000;margin:10px 0}.item,.total{display:flex;justify-content:space-between}.item{margin-bottom:5px}.total{font-weight:700;font-size:14px;margin-top:10px}.footer{text-align:center;margin-top:20px;font-size:10px}img{display:block;margin:10px auto;width:80px;height:80px}</style></head><body>
      <div class="header"><h3>${branchDetails?.name || 'Sucursal'}</h3><p>${formatDateTime(sale.created_at)}</p>${sale.customer_name ? `<p>Cliente: ${sale.customer_name}</p>`:''}</div><div class="divider"></div>
      ${sale.sale_items?.map(item=>`<div class="item"><span>${item.quantity}x ${item.product_name}</span><span>$${(item.unit_price*item.quantity).toLocaleString('es-AR')}</span></div>`).join('')||''}
      <div class="divider"></div><div class="total"><span>TOTAL</span><span>${formatCurrency(sale.total)}</span></div>
      <div class="item" style="margin-top:5px;font-size:11px"><span>Método:</span><span>${sale.payment_method}</span></div>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${sale.id}" alt="QR Code">
      <div class="footer"><p>¡Gracias por su compra!</p></div>
      <script>window.onload=function(){window.print();window.close()}</script></body></html>
    `;
    const printWindow = window.open('','','height=600,width=400');
    printWindow.document.write(ticketContent);
    printWindow.document.close();
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
          { title: "Ticket Promedio", value: formatCurrency(metrics.averageTicket), desc: "Promedio por venta", icon: TrendingUp, color: "text-blue-600" },
          { title: "Clientes Únicos", value: metrics.customerCount, desc: "En el periodo seleccionado", icon: Users, color: "text-orange-600" }
        ].map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * (i+1) }}>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{loading ? "..." : item.value}</div>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <SalesTable sales={salesData} loading={loading} onDelete={handleDeleteSale} onPrint={printTicket} />
    </div>
  );
};

export default DashboardHome;
