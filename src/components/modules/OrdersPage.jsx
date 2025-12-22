
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Plus, Search, FileText, Eye, Edit, Trash2, 
  Calendar, CheckCircle, Clock, X, DollarSign, Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger 
} from "@/components/ui/dialog";
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
  
  // Filters
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  
  // New Order Form State
  const [orderForm, setOrderForm] = useState({
    client_name: '',
    products: [], // { id, name, price, quantity, type: 'stock' }
    custom_products: [], // { name, price, quantity, type: 'custom' }
    currency: 'ARS',
    paid_amount: 0,
    order_date: getArgentinaDate() // Default to today
  });

  // Product Selection State
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [customProductForm, setCustomProductForm] = useState({ name: '', price: 0, quantity: 1 });

  useEffect(() => {
    if (branchId) {
      fetchOrders();
      fetchProducts();
    }
  }, [branchId]);

  const fetchOrders = async () => {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('*')
      .eq('branch_id', branchId)
      .order('order_date', { ascending: false });

    if (dateFilter.start) query = query.gte('order_date', `${dateFilter.start}T00:00:00-03:00`);
    if (dateFilter.end) query = query.lte('order_date', `${dateFilter.end}T23:59:59-03:00`);

    const { data, error } = await query;
    if (error) {
      toast({ title: "Error al cargar pedidos", variant: "destructive" });
    } else {
      setOrders(data);
    }
    setLoading(false);
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('branch_id', branchId);
    if (data) setProducts(data);
  };

  const calculateTotal = () => {
    const stockTotal = orderForm.products.reduce((acc, p) => acc + (Number(p.price) * Number(p.quantity)), 0);
    const customTotal = orderForm.custom_products.reduce((acc, p) => acc + (Number(p.price) * Number(p.quantity)), 0);
    return stockTotal + customTotal;
  };

  const handleAddStockProduct = () => {
    if (!selectedProduct) return;
    const prod = products.find(p => p.id === selectedProduct);
    if (!prod) return;

    setOrderForm(prev => ({
      ...prev,
      products: [...prev.products, {
        id: prod.id,
        name: prod.name,
        price: prod.price, // Use current price, but it should probably be editable or frozen? Sticking to current requirements.
        quantity: Number(selectedQty),
        type: 'stock'
      }]
    }));
    setSelectedProduct('');
    setSelectedQty(1);
  };

  const handleAddCustomProduct = () => {
    if (!customProductForm.name || customProductForm.price <= 0) return;
    setOrderForm(prev => ({
      ...prev,
      custom_products: [...prev.custom_products, {
        name: customProductForm.name,
        price: Number(customProductForm.price),
        quantity: Number(customProductForm.quantity),
        type: 'custom'
      }]
    }));
    setCustomProductForm({ name: '', price: 0, quantity: 1 });
  };

  const removeProductFromForm = (index, type) => {
    if (type === 'stock') {
      setOrderForm(prev => ({ ...prev, products: prev.products.filter((_, i) => i !== index) }));
    } else {
      setOrderForm(prev => ({ ...prev, custom_products: prev.custom_products.filter((_, i) => i !== index) }));
    }
  };

  const handleSubmitOrder = async () => {
    const total = calculateTotal();
    const pending = total - Number(orderForm.paid_amount);
    let status = 'Pendiente';
    if (pending <= 0) status = 'Pagado';
    else if (Number(orderForm.paid_amount) > 0) status = 'Parcial';

    const payload = {
      branch_id: branchId,
      client_name: orderForm.client_name,
      products: orderForm.products,
      custom_products: orderForm.custom_products,
      currency: orderForm.currency,
      total_amount: total,
      paid_amount: Number(orderForm.paid_amount),
      pending_amount: pending,
      order_date: orderForm.order_date, // Should be date object or ISO string
      status: status
    };

    const { error } = await supabase.from('orders').insert([payload]);

    if (error) {
      console.error(error);
      toast({ title: "Error al crear pedido", variant: "destructive" });
    } else {
      toast({ title: "Pedido creado exitosamente" });
      setIsDialogOpen(false);
      resetForm();
      fetchOrders();
    }
  };

  const handleDeleteOrder = async (id) => {
    if (!window.confirm("¿Eliminar este pedido?")) return;
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) toast({ title: "Error al eliminar", variant: "destructive" });
    else {
      toast({ title: "Pedido eliminado" });
      setOrders(orders.filter(o => o.id !== id));
    }
  };

  const resetForm = () => {
    setOrderForm({
      client_name: '',
      products: [],
      custom_products: [],
      currency: 'ARS',
      paid_amount: 0,
      order_date: getArgentinaDate()
    });
  };

  const generatePDF = (order) => {
    const currencySymbol = order.currency === 'USD' ? 'US$' : '$';
    const allProducts = [...(order.products || []), ...(order.custom_products || [])];
    
    const printContent = `
      <html>
        <head>
          <title>Detalle del Pedido</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
            h1 { text-align: center; margin-bottom: 30px; font-size: 24px; color: #000; }
            .header { margin-bottom: 30px; }
            .header p { margin: 5px 0; font-size: 14px; }
            .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; background: #eee; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; }
            th { text-align: left; border-bottom: 2px solid #000; padding: 10px; font-weight: bold; }
            td { border-bottom: 1px solid #ddd; padding: 10px; }
            .totals { float: right; width: 200px; text-align: right; font-size: 14px; }
            .totals div { margin-bottom: 8px; }
            .totals .main-total { font-weight: bold; font-size: 16px; border-top: 1px solid #000; padding-top: 10px; }
            .footer { clear: both; text-align: center; margin-top: 60px; font-style: italic; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>Detalle del Pedido</h1>
          
          <div class="header">
            <p><strong>Fecha:</strong> ${formatDateTime(order.order_date)}</p>
            <p><strong>Cliente:</strong> ${order.client_name}</p>
            <p><strong>Estado:</strong> ${order.status}</p>
          </div>

          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th style="width: 80px;">Cantidad</th>
                <th style="text-align: right;">Precio Unit.</th>
                <th style="text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${allProducts.map(p => `
                <tr>
                  <td>${p.name}</td>
                  <td>${p.quantity}</td>
                  <td style="text-align: right;">${currencySymbol}${Number(p.price).toLocaleString('es-AR')}</td>
                  <td style="text-align: right;">${currencySymbol}${(Number(p.price) * Number(p.quantity)).toLocaleString('es-AR')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="totals">
            <div class="main-total">Total: ${currencySymbol}${Number(order.total_amount).toLocaleString('es-AR')}</div>
            <div style="color: #166534;">Pagado: ${currencySymbol}${Number(order.paid_amount).toLocaleString('es-AR')}</div>
            <div style="color: #991b1b;">Pendiente: ${currencySymbol}${Number(order.pending_amount).toLocaleString('es-AR')}</div>
          </div>

          <div class="footer">
            ¡Gracias por su compra!
          </div>
          
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pagado': return 'bg-green-100 text-green-700';
      case 'Parcial': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-red-100 text-red-700';
    }
  };

  const totals = {
    pendingARS: orders.filter(o => o.currency === 'ARS').reduce((acc, o) => acc + Number(o.pending_amount), 0),
    pendingUSD: orders.filter(o => o.currency === 'USD').reduce((acc, o) => acc + Number(o.pending_amount), 0)
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-gray-500">Gestioná pedidos, filtrá por fecha, exportá a PDF y mantené historial.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-2" /> Nuevo Pedido
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Crear Nuevo Pedido</DialogTitle>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Cliente</label>
                  <Input 
                    value={orderForm.client_name}
                    onChange={e => setOrderForm({...orderForm, client_name: e.target.value})}
                    placeholder="Nombre del cliente"
                  />
                </div>
                <div className="space-y-2">
                   <label className="text-sm font-medium">Fecha</label>
                   <Input 
                     type="date"
                     value={orderForm.order_date}
                     onChange={e => setOrderForm({...orderForm, order_date: e.target.value})}
                   />
                </div>
              </div>

              {/* Add Products Section */}
              <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                <h3 className="font-medium text-sm flex items-center gap-2">
                  <Package className="w-4 h-4" /> Agregar Productos de Stock
                </h3>
                <div className="flex gap-2">
                  <select 
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={selectedProduct}
                    onChange={e => setSelectedProduct(e.target.value)}
                  >
                    <option value="">Seleccionar producto...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} - ${p.price}</option>
                    ))}
                  </select>
                  <Input 
                    type="number" 
                    className="w-20" 
                    min="1" 
                    value={selectedQty}
                    onChange={e => setSelectedQty(e.target.value)}
                  />
                  <Button onClick={handleAddStockProduct} type="button" variant="secondary">Agregar</Button>
                </div>
              </div>

              {/* Add Custom Products Section */}
              <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
                <h3 className="font-medium text-sm flex items-center gap-2">
                  <Edit className="w-4 h-4" /> Agregar Producto Personalizado
                </h3>
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-5">
                    <Input 
                      placeholder="Nombre del producto" 
                      value={customProductForm.name}
                      onChange={e => setCustomProductForm({...customProductForm, name: e.target.value})}
                    />
                  </div>
                  <div className="col-span-3">
                     <Input 
                      type="number" 
                      placeholder="Precio" 
                      value={customProductForm.price}
                      onChange={e => setCustomProductForm({...customProductForm, price: e.target.value})}
                    />
                  </div>
                  <div className="col-span-2">
                     <Input 
                      type="number" 
                      placeholder="Cant." 
                      value={customProductForm.quantity}
                      onChange={e => setCustomProductForm({...customProductForm, quantity: e.target.value})}
                    />
                  </div>
                  <div className="col-span-2">
                    <Button onClick={handleAddCustomProduct} type="button" variant="secondary" className="w-full">Agregar</Button>
                  </div>
                </div>
              </div>

              {/* Products List Preview */}
              {(orderForm.products.length > 0 || orderForm.custom_products.length > 0) && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2 text-left">Producto</th>
                        <th className="p-2 text-center">Cant.</th>
                        <th className="p-2 text-right">Precio</th>
                        <th className="p-2 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderForm.products.map((p, i) => (
                        <tr key={`stock-${i}`} className="border-b">
                          <td className="p-2">{p.name} <span className="text-xs text-gray-500">(Stock)</span></td>
                          <td className="p-2 text-center">{p.quantity}</td>
                          <td className="p-2 text-right">${p.price}</td>
                          <td className="p-2 text-center">
                            <button onClick={() => removeProductFromForm(i, 'stock')} className="text-red-500"><X className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))}
                       {orderForm.custom_products.map((p, i) => (
                        <tr key={`custom-${i}`} className="border-b">
                          <td className="p-2">{p.name} <span className="text-xs text-blue-500">(Custom)</span></td>
                          <td className="p-2 text-center">{p.quantity}</td>
                          <td className="p-2 text-right">${p.price}</td>
                          <td className="p-2 text-center">
                            <button onClick={() => removeProductFromForm(i, 'custom')} className="text-red-500"><X className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals & Payment */}
              <div className="grid grid-cols-2 gap-4 items-end">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Moneda</label>
                  <select 
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={orderForm.currency}
                    onChange={e => setOrderForm({...orderForm, currency: e.target.value})}
                  >
                    <option value="ARS">ARS ($)</option>
                    <option value="USD">USD (US$)</option>
                  </select>
                </div>
                 <div className="space-y-2">
                   <label className="text-sm font-medium">Monto Abonado (Seña)</label>
                   <Input 
                     type="number"
                     value={orderForm.paid_amount}
                     onChange={e => setOrderForm({...orderForm, paid_amount: e.target.value})}
                   />
                </div>
              </div>

              <div className="flex justify-end pt-4 text-lg font-bold">
                Total Estimado: ${calculateTotal().toLocaleString()}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmitOrder} className="bg-indigo-600 hover:bg-indigo-700">Guardar Pedido</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats / Filters Bar */}
      <Card className="bg-white">
        <CardContent className="p-6 flex flex-col md:flex-row gap-4 justify-between items-end">
          <div className="flex gap-4 w-full md:w-auto">
             <div className="space-y-1">
               <label className="text-xs font-semibold text-gray-500">Desde</label>
               <Input 
                 type="date" 
                 className="w-full md:w-40" 
                 value={dateFilter.start}
                 onChange={e => setDateFilter({...dateFilter, start: e.target.value})}
               />
             </div>
             <div className="space-y-1">
               <label className="text-xs font-semibold text-gray-500">Hasta</label>
               <Input 
                 type="date" 
                 className="w-full md:w-40" 
                 value={dateFilter.end}
                 onChange={e => setDateFilter({...dateFilter, end: e.target.value})}
               />
             </div>
             <Button 
               variant="outline" 
               className="mb-[1px]" 
               onClick={() => { setDateFilter({start:'', end:''}); fetchOrders(); }}
             >
               Limpiar filtros
             </Button>
          </div>
          <div className="flex gap-4 text-sm font-medium">
             <div className="px-4 py-2 bg-gray-50 rounded-lg border border-gray-100">
               Total pendiente (ARS): <span className="text-red-600 font-bold">${totals.pendingARS.toLocaleString()}</span>
             </div>
             <div className="px-4 py-2 bg-gray-50 rounded-lg border border-gray-100">
               Total pendiente (USD): <span className="text-red-600 font-bold">US${totals.pendingUSD.toLocaleString()}</span>
             </div>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center p-10 text-gray-400">Cargando pedidos...</div>
        ) : orders.length === 0 ? (
          <div className="text-center p-10 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400">
            No hay pedidos registrados en este período.
          </div>
        ) : (
          orders.map((order) => {
            const currencySymbol = order.currency === 'USD' ? 'US$' : '$';
            const firstProduct = order.products?.[0] || order.custom_products?.[0];
            const productCount = (order.products?.length || 0) + (order.custom_products?.length || 0);

            return (
              <motion.div 
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-bold text-gray-900 md:text-xl text-red-700">{order.client_name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </div>
                    <div className="text-gray-600 text-sm">
                      {firstProduct ? (
                         <span>
                           x{firstProduct.quantity} {firstProduct.name}
                           {productCount > 1 && <span className="text-gray-400 ml-1">+{productCount - 1} más</span>}
                         </span>
                      ) : (
                        <span className="italic text-gray-400">Sin productos</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 font-medium">
                      {formatDateTime(order.order_date).split(',')[0]}
                    </div>
                  </div>

                  <div className="flex flex-col md:items-end justify-between gap-4">
                    <div className="text-right space-y-1 text-sm">
                      <div className="text-gray-900 font-bold">Total {currencySymbol}{Number(order.total_amount).toLocaleString('es-AR')}</div>
                      <div className="text-green-600">Pagado {currencySymbol}{Number(order.paid_amount).toLocaleString('es-AR')}</div>
                      <div className="text-red-600">Pendiente {currencySymbol}{Number(order.pending_amount).toLocaleString('es-AR')}</div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="bg-green-700 text-white hover:bg-green-800 hover:text-white border-none" onClick={() => generatePDF(order)}>
                        <FileText className="w-4 h-4 mr-2" /> PDF
                      </Button>
                      <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        <Eye className="w-4 h-4 mr-2" /> Detalle
                      </Button>
                      <Button size="sm" variant="outline" className="bg-yellow-500 text-white hover:bg-yellow-600 hover:text-white border-none">
                        <Edit className="w-4 h-4 mr-2" /> Editar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDeleteOrder(order.id)}>
                        <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default OrdersPage;
