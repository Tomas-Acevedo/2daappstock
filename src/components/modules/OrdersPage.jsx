import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Plus, Search, FileText, Eye, Edit, Trash2, 
  Calendar, X, Package, Info, ChevronLeft, ChevronRight, Loader2, StickyNote 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; 
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDateTime, getArgentinaDate } from '@/lib/utils';
import { Card, CardContent } from "@/components/ui/card";

const OrdersPage = () => {
  const { branchId } = useParams();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [products, setProducts] = useState([]);
  
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState({ pendingARS: 0, pendingUSD: 0 });
  const itemsPerPage = 15;

  const [orderForm, setOrderForm] = useState({
    client_name: '', products: [], custom_products: [], 
    currency: 'ARS', paid_amount: 0, order_date: getArgentinaDate(), notes: '' 
  });

  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [customProductForm, setCustomProductForm] = useState({ name: '', price: 0, quantity: 1 });

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;

    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .order('order_date', { ascending: false })
      .range(from, to);

    if (searchTerm) {
      query = query.or(`client_name.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);
    }

    if (dateFilter.start) query = query.gte('order_date', `${dateFilter.start}T00:00:00-03:00`);
    if (dateFilter.end) query = query.lte('order_date', `${dateFilter.end}T23:59:59-03:00`);

    const { data, count, error } = await query;
    
    if (error) {
      toast({ title: "Error al cargar pedidos", variant: "destructive" });
    } else {
      setOrders(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [branchId, currentPage, searchTerm, dateFilter]);

  const fetchSummary = useCallback(async () => {
    let query = supabase.from('orders').select('pending_amount, currency, client_name, notes, order_date').eq('branch_id', branchId);
    
    if (dateFilter.start) query = query.gte('order_date', `${dateFilter.start}T00:00:00-03:00`);
    if (dateFilter.end) query = query.lte('order_date', `${dateFilter.end}T23:59:59-03:00`);
    if (searchTerm) query = query.or(`client_name.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);

    const { data } = await query;
    if (data) {
      const ars = data.filter(o => o.currency === 'ARS').reduce((acc, o) => acc + Number(o.pending_amount), 0);
      const usd = data.filter(o => o.currency === 'USD').reduce((acc, o) => acc + Number(o.pending_amount), 0);
      setSummary({ pendingARS: ars, pendingUSD: usd });
    }
  }, [branchId, dateFilter, searchTerm]);

  useEffect(() => {
    if (branchId) {
      fetchOrders();
      fetchSummary();
    }
  }, [fetchOrders, fetchSummary]);

  useEffect(() => {
    const getProds = async () => {
      const { data } = await supabase.from('products').select('*').eq('branch_id', branchId);
      if (data) setProducts(data);
    };
    if(branchId) getProds();
  }, [branchId]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, dateFilter]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pagado': return 'bg-green-100 text-green-700';
      case 'Parcial': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-red-100 text-red-700';
    }
  };

  const calculateTotal = () => {
    const stockTotal = orderForm.products.reduce((acc, p) => acc + (Number(p.price) * Number(p.quantity)), 0);
    const customTotal = orderForm.custom_products.reduce((acc, p) => acc + (Number(p.price) * Number(p.quantity)), 0);
    return stockTotal + customTotal;
  };

  const handleAddStockProduct = () => {
    if (!selectedProduct) return;
    const prod = products.find(p => p.id === selectedProduct);
    if (prod) {
      setOrderForm(prev => ({ ...prev, products: [...prev.products, { id: prod.id, name: prod.name, price: prod.price, quantity: Number(selectedQty), type: 'stock' }] }));
      setSelectedProduct(''); setSelectedQty(1);
    }
  };

  const handleAddCustomProduct = () => {
    if (!customProductForm.name || customProductForm.price <= 0) return;
    setOrderForm(prev => ({ ...prev, custom_products: [...prev.custom_products, { ...customProductForm, type: 'custom' }] }));
    setCustomProductForm({ name: '', price: 0, quantity: 1 });
  };

  const removeProductFromForm = (index, type) => {
    if (type === 'stock') setOrderForm(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== index) }));
    else setOrderForm(prev => ({ ...prev, custom_products: prev.custom_products.filter((_, i) => i !== index) }));
  };

  const handleSubmitOrder = async () => {
    const total = calculateTotal();
    const pending = total - Number(orderForm.paid_amount);
    let status = pending <= 0 ? 'Pagado' : Number(orderForm.paid_amount) > 0 ? 'Parcial' : 'Pendiente';

    const payload = {
      ...orderForm, branch_id: branchId, total_amount: total, pending_amount: pending,
      order_date: `${orderForm.order_date}T12:00:00-03:00`, status: status
    };

    try {
      if (editingOrder) await supabase.from('orders').update(payload).eq('id', editingOrder.id);
      else await supabase.from('orders').insert([payload]);
      
      toast({ title: editingOrder ? "Pedido actualizado" : "Pedido creado exitosamente" });
      setIsDialogOpen(false); resetForm(); fetchOrders(); fetchSummary();
    } catch (error) { toast({ title: "Error al guardar", description: "Verifica tu conexión", variant: "destructive" }); }
  };

  const handleEditOrder = (order) => {
    setEditingOrder(order);
    setOrderForm({ ...order, order_date: order.order_date.split('T')[0] });
    setIsDialogOpen(true);
  };

  const handleShowDetails = (order) => {
    setSelectedOrder(order);
    setIsDetailsOpen(true);
  };

  const resetForm = () => {
    setEditingOrder(null);
    setOrderForm({ client_name: '', products: [], custom_products: [], currency: 'ARS', paid_amount: 0, order_date: getArgentinaDate(), notes: '' });
  };

  const handleDeleteOrder = async (id) => {
    if (!window.confirm("¿Eliminar este pedido?")) return;
    await supabase.from('orders').delete().eq('id', id);
    toast({ title: "Pedido eliminado" });
    fetchOrders(); fetchSummary();
  };

  const generatePDF = (order) => {
    const currencySymbol = order.currency === 'USD' ? 'US$' : '$';
    const allProducts = [...(order.products || []), ...(order.custom_products || [])];
    const printContent = `
      <html>
        <head><title>Ticket Pedido</title><style>body{font-family:Arial;padding:40px;max-width:600px;margin:0 auto;}table{width:100%;border-collapse:collapse;margin:20px 0;}th{border-bottom:2px solid #000;text-align:left;padding:10px;}td{padding:10px;border-bottom:1px solid #eee;}.totals{text-align:right;margin-top:20px;font-weight:bold;}</style></head>
        <body>
          <h2>Detalle de Pedido</h2>
          <p><strong>Cliente:</strong> ${order.client_name}</p>
          <p><strong>Fecha:</strong> ${formatDateTime(order.order_date)}</p>
          <table>
            <thead><tr><th>Item</th><th>Cant</th><th>Unit</th><th>Total</th></tr></thead>
            <tbody>${allProducts.map(p=>`<tr><td>${p.name}</td><td>${p.quantity}</td><td>${currencySymbol}${Number(p.price).toLocaleString()}</td><td>${currencySymbol}${(p.price*p.quantity).toLocaleString()}</td></tr>`).join('')}</tbody>
          </table>
          <div class="totals">TOTAL: ${currencySymbol}${Number(order.total_amount).toLocaleString()}</div>
          <script>window.print();</script>
        </body>
      </html>
    `;
    const win = window.open('', '_blank'); win.document.write(printContent); win.document.close();
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Pedidos</h1>
          <p className="text-gray-500 text-sm">Gestiona saldos y notas con ordenamiento real (Nuevos primero).</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { if(!open) resetForm(); setIsDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 rounded-2xl h-12 px-6 font-bold shadow-lg uppercase text-xs tracking-widest"><Plus className="w-4 h-4 mr-2" /> Nuevo Pedido</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl">
            <DialogHeader><DialogTitle className="text-2xl font-black">{editingOrder ? 'Editar Pedido' : 'Crear Nuevo Pedido'}</DialogTitle></DialogHeader>
            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><label className="text-xs font-black uppercase text-gray-400 ml-1">Cliente</label><Input value={orderForm.client_name} onChange={e => setOrderForm({...orderForm, client_name: e.target.value})} placeholder="Nombre completo" className="rounded-xl h-12" /></div>
                <div className="space-y-2"><label className="text-xs font-black uppercase text-gray-400 ml-1">Fecha</label><Input type="date" value={orderForm.order_date} onChange={e => setOrderForm({...orderForm, order_date: e.target.value})} className="rounded-xl h-12" /></div>
              </div>
              <div className="space-y-2"><label className="text-xs font-black uppercase text-gray-400 ml-1">Notas</label><textarea value={orderForm.notes} onChange={e => setOrderForm({...orderForm, notes: e.target.value})} placeholder="Detalles extra..." className="w-full min-h-[80px] rounded-xl border border-input p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" /></div>

              {/* Inventario */}
              <div className="space-y-4 border rounded-2xl p-5 bg-gray-50/50 border-gray-100">
                <h3 className="font-bold text-xs flex items-center gap-2 text-indigo-600 uppercase tracking-widest"><Package className="w-4 h-4" /> Desde Inventario</h3>
                <div className="flex gap-2">
                  <select className="flex h-12 w-full rounded-xl border border-input bg-white px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500" value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {products.map(p => (<option key={p.id} value={p.id}>{p.name} - {formatCurrency(p.price)}</option>))}
                  </select>
                  <Input type="number" className="w-24 h-12 rounded-xl font-bold" min="1" value={selectedQty} onFocus={e => e.target.select()} onChange={e => setSelectedQty(e.target.value)} />
                  <Button onClick={handleAddStockProduct} type="button" variant="secondary" className="h-12 rounded-xl px-6 font-bold">Sumar</Button>
                </div>
              </div>

              {/* Personalizado */}
              <div className="space-y-4 border rounded-2xl p-5 bg-gray-50/50 border-gray-100">
                <h3 className="font-bold text-xs flex items-center gap-2 text-blue-600 uppercase tracking-widest"><Edit className="w-4 h-4" /> Personalizado</h3>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-5"><Input placeholder="Descripción" value={customProductForm.name} onChange={e => setCustomProductForm({...customProductForm, name: e.target.value})} className="rounded-xl h-12" /></div>
                  <div className="col-span-3"><Input type="number" placeholder="Precio" value={customProductForm.price} onFocus={e => e.target.select()} onChange={e => setCustomProductForm({...customProductForm, price: e.target.value})} className="rounded-xl h-12" /></div>
                  <div className="col-span-2"><Input type="number" placeholder="Cant." value={customProductForm.quantity} onFocus={e => e.target.select()} onChange={e => setCustomProductForm({...customProductForm, quantity: e.target.value})} className="rounded-xl h-12" /></div>
                  <div className="col-span-2"><Button onClick={handleAddCustomProduct} type="button" variant="secondary" className="w-full h-12 rounded-xl font-bold">Sumar</Button></div>
                </div>
              </div>

              {/* ✅ TABLA DE PRODUCTOS AGREGADOS (VISTA EN MODAL) - AHORA ARRIBA DEL TOTAL */}
              {(orderForm.products.length > 0 || orderForm.custom_products.length > 0) && (
                <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm mt-2">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400"><tr><th className="p-3 text-left">Producto</th><th className="p-3 text-center">Cant.</th><th className="p-3 text-right">Precio</th><th className="p-3"></th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {orderForm.products.map((p, i) => (<tr key={`stock-${i}`}><td className="p-3 font-medium text-gray-700">{p.name} <span className="text-[9px] bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded ml-1 uppercase font-bold">Stock</span></td><td className="p-3 text-center font-bold">{p.quantity}</td><td className="p-3 text-right font-black">{formatCurrency(p.price)}</td><td className="p-3 text-center"><button onClick={() => removeProductFromForm(i, 'stock')} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button></td></tr>))}
                      {orderForm.custom_products.map((p, i) => (<tr key={`custom-${i}`}><td className="p-3 font-medium text-gray-700">{p.name} <span className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded ml-1 uppercase font-bold">Custom</span></td><td className="p-3 text-center font-bold">{p.quantity}</td><td className="p-3 text-right font-black">{formatCurrency(p.price)}</td><td className="p-3 text-center"><button onClick={() => removeProductFromForm(i, 'custom')} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button></td></tr>))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 items-end bg-indigo-50/30 p-5 rounded-2xl">
                <div className="space-y-2"><label className="text-xs font-black uppercase text-gray-400 ml-1">Moneda</label><select className="flex h-12 w-full rounded-xl border border-input bg-white px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500" value={orderForm.currency} onChange={e => setOrderForm({...orderForm, currency: e.target.value})}><option value="ARS">Peso Argentino ($)</option><option value="USD">Dólar (US$)</option></select></div>
                <div className="space-y-2"><label className="text-xs font-black uppercase text-gray-400 ml-1">Abonado (Seña)</label><Input type="number" value={orderForm.paid_amount} onFocus={e => e.target.select()} onChange={e => setOrderForm({...orderForm, paid_amount: e.target.value})} className="rounded-xl h-12 bg-white font-bold text-green-600 focus:ring-2 focus:ring-green-500" /></div>
              </div>
              <div className="flex justify-between items-center bg-indigo-600 p-6 rounded-2xl text-white shadow-xl shadow-indigo-100"><span className="font-bold opacity-80 uppercase text-xs tracking-widest">Total Estimado</span><span className="text-3xl font-black tracking-tighter">{orderForm.currency === 'USD' ? 'US$' : '$'}{calculateTotal().toLocaleString('es-AR')}</span></div>
            </div>
            <DialogFooter><Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="font-bold rounded-xl">Cancelar</Button><Button onClick={handleSubmitOrder} className="bg-indigo-600 hover:bg-indigo-700 rounded-xl h-12 px-8 font-black uppercase text-xs tracking-wider">Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtros */}
      <Card className="bg-white border-gray-100 rounded-3xl overflow-hidden shadow-sm">
        <CardContent className="p-6 flex flex-col md:flex-row gap-6 justify-between items-end">
          <div className="flex flex-wrap gap-4 w-full md:w-auto">
             <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Buscar</label>
               <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Cliente o nota..." className="pl-9 w-full md:w-64 rounded-xl border-gray-200" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
             </div>
             <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Desde</label><Input type="date" className="w-full md:w-44 rounded-xl border-gray-200" value={dateFilter.start} onChange={e => setDateFilter({...dateFilter, start: e.target.value})} /></div>
             <div className="space-y-1"><label className="text-[10px] font-black uppercase text-gray-400 ml-1">Hasta</label><Input type="date" className="w-full md:w-44 rounded-xl border-gray-200" value={dateFilter.end} onChange={e => setDateFilter({...dateFilter, end: e.target.value})} /></div>
             <Button variant="outline" className="rounded-xl h-10 mt-auto font-bold border-gray-200 text-gray-500 uppercase text-[10px]" onClick={() => { setDateFilter({start:'', end:''}); setSearchTerm(''); }}>Limpiar filtros</Button>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
             <div className="px-4 py-3 bg-red-50/50 rounded-2xl border border-red-50 text-center"><p className="text-[9px] font-black uppercase text-red-400 tracking-widest">Pendiente ARS</p><p className="text-lg font-black text-red-600">${summary.pendingARS.toLocaleString('es-AR')}</p></div>
             <div className="px-4 py-3 bg-indigo-50/50 rounded-2xl border border-indigo-50 text-center"><p className="text-[9px] font-black uppercase text-indigo-400 tracking-widest">Pendiente USD</p><p className="text-lg font-black text-indigo-600">US${summary.pendingUSD.toLocaleString('es-AR')}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Pedidos */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 text-indigo-500"><Loader2 className="w-10 h-10 animate-spin mb-4" /><p className="font-bold uppercase text-[10px] tracking-widest">Cargando...</p></div>
        ) : orders.length === 0 ? (
          <div className="text-center p-20 bg-white rounded-3xl border border-dashed border-gray-200 text-gray-400 flex flex-col items-center"><Package className="w-12 h-12 mb-4 opacity-20" /><p className="font-medium italic">Sin registros.</p></div>
        ) : (
          <>
            {orders.map((order) => {
              const symbol = order.currency === 'USD' ? 'US$' : '$';
              return (
                <motion.div key={order.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 hover:border-indigo-100 transition-all group">
                  <div className="flex flex-col md:flex-row justify-between gap-6">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3"><h3 className="text-xl font-black text-gray-900 group-hover:text-indigo-600 transition-colors">{order.client_name}</h3><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${getStatusColor(order.status)}`}>{order.status}</span></div>
                      {order.notes && (<div className="flex items-start gap-2 bg-gray-50 p-2 rounded-lg border border-gray-100 max-w-md"><StickyNote className="w-3.5 h-3.5 text-amber-500 mt-1 shrink-0" /><p className="text-xs text-gray-600 line-clamp-2 italic">{order.notes}</p></div>)}
                      
                      {/* ✅ MUESTRA DETALLE DE PRODUCTOS EN LA CARD */}
                      <div className="flex flex-col gap-1.5 mt-1 border-l-2 border-indigo-50 pl-3">
                        {([...(order.products || []), ...(order.custom_products || [])]).map((p, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-gray-700 text-[13px] font-medium leading-tight">
                            <span className="font-black text-indigo-400">{p.quantity}x</span>
                            <span className="truncate max-w-[300px]">{p.name}</span>
                            <span className="text-gray-400 font-normal text-[11px] whitespace-nowrap">({formatCurrency(p.price)})</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest"><Calendar className="w-3.5 h-3.5" />{formatDateTime(order.order_date).split(',')[0]}</div>
                    </div>
                    
                    <div className="flex flex-col md:items-end justify-between gap-4">
                      <div className="text-right space-y-1">
                        <div className="flex flex-col items-end leading-tight mb-2"><span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">TOTAL</span><span className="text-4xl font-black text-gray-900 tracking-tighter">{symbol}{Number(order.total_amount).toLocaleString('es-AR')}</span></div>
                        <div className="flex gap-4 justify-end items-center text-[11px] font-bold uppercase tracking-widest">
                           <div className="flex gap-1.5 items-center"><span className="text-green-600 opacity-60">PAGADO</span><span className="text-green-600 text-sm font-black">{symbol}{Number(order.paid_amount).toLocaleString('es-AR')}</span></div>
                           <div className="flex gap-1.5 items-center"><span className="text-red-600 opacity-60">SALDO</span><span className="text-red-600 text-sm font-black">{symbol}{Number(order.pending_amount).toLocaleString('es-AR')}</span></div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" className="rounded-xl hover:bg-green-50 font-bold" onClick={() => generatePDF(order)}><FileText className="w-4 h-4 mr-2" /> PDF</Button>
                        <Button size="sm" variant="ghost" className="rounded-xl hover:bg-indigo-50 font-bold" onClick={() => handleShowDetails(order)}><Eye className="w-4 h-4 mr-2" /> Detalle</Button>
                        <Button size="sm" variant="ghost" className="rounded-xl hover:bg-yellow-50 font-bold" onClick={() => handleEditOrder(order)}><Edit className="w-4 h-4 mr-2" /> Editar</Button>
                        <Button size="sm" variant="ghost" className="rounded-xl hover:bg-red-50 text-red-600 font-bold" onClick={() => handleDeleteOrder(order.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 pt-6 pb-10"><Button variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} className="rounded-xl h-10 w-10 p-0 hover:bg-indigo-50 hover:text-indigo-600"><ChevronLeft className="w-5 h-5" /></Button>
                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 uppercase tracking-widest">Pág. {currentPage} / {totalPages}</span>
                <Button variant="outline" disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} className="rounded-xl h-10 w-10 p-0 hover:bg-indigo-50 hover:text-indigo-600"><ChevronRight className="w-5 h-5" /></Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ✅ MODAL DE DETALLE RESPONSIVE CORREGIDO */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl border-none p-4 md:p-6">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-2xl font-black"><Info className="w-6 h-6 text-indigo-600" /> Detalle - {selectedOrder?.client_name}</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4 text-xs font-bold bg-gray-50 p-6 rounded-2xl border border-gray-100">
                <div className="space-y-1"><p className="text-gray-400 uppercase tracking-widest">Fecha Registrada</p><p className="text-gray-800 text-sm font-black">{formatDateTime(selectedOrder.order_date)}</p></div>
                <div className="space-y-1"><p className="text-gray-400 uppercase tracking-widest">Estado</p><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase inline-block ${getStatusColor(selectedOrder.status)}`}>{selectedOrder.status}</span></div>
              </div>
              {selectedOrder.notes && (<div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 text-sm italic"><strong>Nota:</strong> {selectedOrder.notes}</div>)}
              
              <div className="border border-gray-100 rounded-2xl overflow-x-auto shadow-sm">
                <table className="w-full text-sm min-w-[400px]">
                  <thead className="bg-gray-50/50 font-black text-[10px] uppercase text-gray-400"><tr><th className="p-4 text-left">Ítem</th><th className="p-4 text-center">Cant.</th><th className="p-4 text-right">Unitario</th><th className="p-4 text-right">Subtotal</th></tr></thead>
                  <tbody className="divide-y">{[...(selectedOrder.products || []), ...(selectedOrder.custom_products || [])].map((p, i) => (
                    <tr key={i} className="hover:bg-gray-50/30 transition-all"><td className="p-4 font-bold text-gray-800">{p.name}</td><td className="p-4 text-center font-bold">{p.quantity}</td><td className="p-4 text-right font-medium text-gray-500">{selectedOrder.currency === 'USD' ? 'US$' : '$'}{Number(p.price).toLocaleString('es-AR')}</td><td className="p-4 text-right font-black text-gray-900">{selectedOrder.currency === 'USD' ? 'US$' : '$'}{(Number(p.price) * Number(p.quantity)).toLocaleString('es-AR')}</td></tr>))}</tbody>
                </table>
              </div>

              <div className="flex flex-col items-end gap-2 bg-indigo-900/5 p-6 rounded-2xl border border-indigo-100 shadow-inner">
                <div className="text-4xl font-black text-indigo-900 tracking-tighter">{selectedOrder.currency === 'USD' ? 'US$' : '$'}{Number(selectedOrder.total_amount).toLocaleString('es-AR')}</div>
                <div className="flex gap-4 pt-2 border-t border-indigo-100 w-full justify-end uppercase text-[9px] font-black tracking-widest">
                   <div className="text-right text-green-600"><p className="opacity-60">Pagado</p><p className="text-base font-black">{selectedOrder.currency === 'USD' ? 'US$' : '$'}{Number(selectedOrder.paid_amount).toLocaleString('es-AR')}</p></div>
                   <div className="text-right text-red-600"><p className="opacity-60">Saldo</p><p className="text-base font-black">{selectedOrder.currency === 'USD' ? 'US$' : '$'}{Number(selectedOrder.pending_amount).toLocaleString('es-AR')}</p></div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0 mt-4 flex-col sm:flex-row"><Button variant="outline" className="w-full sm:w-auto rounded-xl font-bold" onClick={() => setIsDetailsOpen(false)}>Cerrar Detalle</Button><Button className="w-full sm:w-auto bg-green-700 hover:bg-green-800 text-white rounded-xl font-bold shadow-lg" onClick={() => generatePDF(selectedOrder)}><FileText className="w-4 h-4 mr-2" /> Descargar PDF</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrdersPage;