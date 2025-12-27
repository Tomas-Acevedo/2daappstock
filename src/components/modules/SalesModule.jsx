import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SalesHistoryPage from './SalesHistoryPage';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, ShoppingCart, Trash2, Plus, Minus,
  Loader2, Tag, ChevronLeft, ChevronRight, Edit3, User, FileText
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDateTime } from '@/lib/utils';

const SalesModule = () => {
  const { branchId } = useParams();
  const [activeTab, setActiveTab] = useState("new-sale");

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [needsReceipt, setNeedsReceipt] = useState('no');

  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 20;

  const [cart, setCart] = useState([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [branchDetails, setBranchDetails] = useState({ name: '', logo_url: '', address: '', tel: '' });

  const fetchProducts = useCallback(async () => {
    if (!branchId) return;
    try {
      setLoading(true);
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('products')
        .select('*, categories(name)', { count: 'exact' })
        .eq('branch_id', branchId)
        .order('name', { ascending: true })
        .range(from, to);

      if (searchTerm) {
        query = query.ilike('name', `%${searchTerm}%`);
      }

      if (selectedCategory !== 'all') {
        query = query.eq('category_id', selectedCategory);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      setProducts(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      toast({ title: "Error cargando productos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [branchId, currentPage, searchTerm, selectedCategory]);

  useEffect(() => {
    if (branchId) {
      fetchProducts();
      fetchCategories();
      fetchPaymentMethods();
      fetchBranchDetails();
    }
  }, [branchId, fetchProducts]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, selectedCategory]);

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('*').eq('branch_id', branchId).order('name');
    if (data) setCategories(data);
  };

  const fetchBranchDetails = async () => {
    const { data } = await supabase.from('branches').select('name, logo_url, address, tel').eq('id', branchId).single();
    if (data) setBranchDetails(data);
  };

  const fetchPaymentMethods = async () => {
    const { data } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (data && data.length > 0) {
      setPaymentMethods(data);
      setSelectedPaymentMethod(data[0]);
    }
  };

  const generateSalePDF = (sale, items) => {
    const element = document.createElement('div');
    element.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 40px; color: #333; background: white; width: 750px; margin: 0 auto;">
        
        <div style="text-align: center; margin-bottom: 40px;">
          ${branchDetails.logo_url ? `<img src="${branchDetails.logo_url}" style="max-height: 120px; display: block; margin: 0 auto 15px auto;" />` : ''}
          <h1 style="font-size: 32px; font-weight: 900; margin: 0; text-transform: uppercase;">${branchDetails.name || 'SUCURSAL'}</h1>
          <p style="font-size: 14px; color: #666; letter-spacing: 2px; margin-top: 10px; font-weight: bold;">COMPROBANTE DE COMPRA</p>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 14px; border-bottom: 2px solid #f0f0f0; padding-bottom: 25px;">
          <div>
            <p style="margin: 5px 0;"><strong style="color: #555;">CLIENTE:</strong> ${sale.customer_name}</p>
            <p style="margin: 5px 0;"><strong style="color: #555;">FECHA:</strong> ${formatDateTime(sale.created_at).split(',')[0]}</p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 5px 0;"><strong style="color: #555;">DIRECCIÓN:</strong> ${branchDetails.address || 'No disponible'}</p>
            <p style="margin: 5px 0;"><strong style="color: #555;">WHATSAPP:</strong> ${branchDetails.tel || 'No disponible'}</p>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 10px 0; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #888; text-transform: uppercase;">DESCRIPCIÓN</th>
              <th style="text-align: center; padding: 10px 0; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #888; text-transform: uppercase;">CANT.</th>
              <th style="text-align: right; padding: 10px 0; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #888; text-transform: uppercase;">P. UNITARIO</th>
              <th style="text-align: right; padding: 10px 0; border-bottom: 2px solid #e2e8f0; font-size: 12px; color: #888; text-transform: uppercase;">SUBTOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(p => `
              <tr>
                <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px;">${p.product_name || p.name}</td>
                <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; text-align: center;">${p.quantity}</td>
                <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; text-align: right;">$${Number(p.unit_price || p.price).toLocaleString('es-AR')}</td>
                <td style="padding: 15px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; text-align: right; font-weight: bold;">$${(Number(p.unit_price || p.price) * p.quantity).toLocaleString('es-AR')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 10px; margin-top: 20px;">
          <div style="width: 250px; border-top: 4px solid #000; margin-top: 15px; padding-top: 15px; display: flex; justify-content: space-between; font-size: 20px; font-weight: 900; color: #000;">
            <span style="text-transform: uppercase;">TOTAL:</span> <span>$${Number(sale.total).toLocaleString('es-AR')}</span>
          </div>
        </div>

        <div style="margin-top: 80px; text-align: center; font-size: 18px; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: 1px;">
          Gracias por su compra
        </div>
      </div>
    `;

    const opt = {
      margin: 0,
      filename: `Venta_${sale.id}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'in', format: 'A4', orientation: 'portrait' }
    };

    const pdfWindow = window.open("", "_blank");
    window.html2pdf().from(element).set(opt).toPdf().get('pdf').then((pdf) => {
      const blob = pdf.output('blob');
      const fileURL = URL.createObjectURL(blob);
      if (pdfWindow) {
        pdfWindow.location.href = fileURL;
      } else {
        window.open(fileURL, '_blank');
      }
    });
  };

  const addToCart = (product) => {
    if (product.stock <= 0) {
      toast({ title: "Sin stock", variant: "destructive" });
      return;
    }
    setCart(prev => {
      const existing = prev.find(p => p.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast({ title: "Stock insuficiente", variant: "destructive" });
          return prev;
        }
        return prev.map(p => p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p);
      }
      return [...prev, { ...product, quantity: 1, is_custom: false }];
    });
  };

  const addCustomToCart = () => {
    if (!customName.trim() || !customPrice || Number(customPrice) <= 0) {
      toast({ title: "Faltan datos", variant: "destructive" });
      return;
    }
    const customItem = {
      id: `custom-${Date.now()}`,
      name: customName,
      price: Number(customPrice),
      quantity: 1,
      is_custom: true,
      stock: 999999
    };
    setCart(prev => [...prev, customItem]);
    setCustomName('');
    setCustomPrice('');
  };

  const removeFromCart = (productId) => setCart(prev => prev.filter(p => p.id !== productId));

  const updateQuantity = (productId, delta) => {
    setCart(prev => prev.map(p => {
      if (p.id === productId) {
        const newQty = p.quantity + delta;
        if (newQty < 1 || newQty > p.stock) return p;
        return { ...p, quantity: newQty };
      }
      return p;
    }));
  };

  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const discountPercent = selectedPaymentMethod ? Number(selectedPaymentMethod.discount_percentage || 0) : 0;
  const discountAmount = (subtotal * discountPercent) / 100;
  const total = subtotal - discountAmount;

  const handleCheckout = async () => {
    if (cart.length === 0 || !selectedPaymentMethod) return;
    setIsProcessing(true);
    try {
      const safeCustomerName = (customerName || "").trim() || "Cliente General";

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert([{
          branch_id: branchId,
          customer_name: safeCustomerName,
          total: total,
          payment_method: selectedPaymentMethod.name
        }])
        .select()
        .single();

      if (saleError) throw saleError;

      const saleItems = cart.map(item => ({
        sale_id: sale.id,
        product_id: item.is_custom ? null : item.id,
        product_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        is_custom: item.is_custom
      }));

      await supabase.from('sale_items').insert(saleItems);

      const stockItemsToUpdate = cart.filter(i => !i.is_custom);
      if (stockItemsToUpdate.length > 0) {
        const stockPayload = stockItemsToUpdate.map(i => ({
          product_id: i.id,
          quantity: i.quantity,
        }));

        await supabase.rpc("apply_sale_stock", {
          p_branch_id: branchId,
          p_items: stockPayload,
        });
      }

      toast({ title: "Venta realizada con éxito" });

      if (needsReceipt === 'yes') {
        generateSalePDF(sale, cart);
      }

      setCustomerName('');
      setCart([]);
      setNeedsReceipt('no');
      fetchProducts();
    } catch (error) {
      toast({ title: "Error al procesar", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <div className="min-h-screen lg:h-[calc(100vh-100px)] flex flex-col pb-20 lg:pb-0">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full min-h-0">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6 shrink-0 px-1">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Punto de Venta</h2>
          <TabsList className="grid w-full md:w-[400px] grid-cols-2 bg-gray-100">
            <TabsTrigger value="new-sale">Nueva Venta</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="new-sale" className="flex-1 overflow-hidden mt-0">
          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 h-full overflow-y-auto lg:overflow-hidden px-1">
            
            <div className="order-2 lg:order-1 lg:col-span-8 flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-3 md:p-4 border-b border-gray-100 bg-gray-50/50 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input placeholder="Buscar productos..." className="pl-9 bg-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  <Button variant={selectedCategory === 'all' ? "default" : "outline"} size="sm" onClick={() => setSelectedCategory('all')} className="rounded-full whitespace-nowrap">Todos</Button>
                  {categories.map(cat => (
                    <Button key={cat.id} variant={selectedCategory === cat.id ? "default" : "outline"} size="sm" onClick={() => setSelectedCategory(cat.id)} className="rounded-full whitespace-nowrap">{cat.name}</Button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-gray-50/30">
                {loading ? (
                  <div className="flex justify-center items-center h-40"><Loader2 className="animate-spin text-indigo-600" /></div>
                ) : products.length === 0 ? (
                  <div className="text-center text-gray-400 mt-10">No se encontraron productos</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                    {products.map(product => (
                      <Card key={product.id} className="cursor-pointer hover:border-indigo-500 transition-all active:scale-95 group" onClick={() => addToCart(product)}>
                        <CardContent className="p-3 md:p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-[10px] md:text-xs uppercase">{product.name.substring(0, 2)}</div>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${product.stock > 5 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>Stock: {product.stock}</span>
                          </div>
                          <h3 className="text-xs md:text-sm font-medium text-gray-900 line-clamp-2 h-8 md:h-10 mb-1">{product.name}</h3>
                          <p className="text-sm md:text-lg font-bold text-indigo-600">{formatCurrency(product.price)}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {!loading && totalPages > 1 && (
                <div className="p-3 border-t border-gray-100 flex justify-between items-center bg-white shrink-0">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total: {totalCount} Productos</p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="rounded-xl h-8 w-8 p-0"><ChevronLeft className="w-4 h-4" /></Button>
                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-xl border border-indigo-100 uppercase">PÁG {currentPage} / {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="rounded-xl h-8 w-8 p-0"><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                </div>
              )}
            </div>

            <div className="order-1 lg:order-2 lg:col-span-4 flex flex-col h-auto lg:h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-h-[400px]">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2 shrink-0">
                <ShoppingCart className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-900">Carrito de Venta</h3>
                {cart.length > 0 && <span className="ml-auto bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full">{cart.length}</span>}
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="p-3 bg-indigo-50/50 border-b border-indigo-100 space-y-2">
                  <p className="text-[10px] font-bold text-indigo-600 uppercase flex items-center gap-1"><Edit3 className="w-3 h-3" /> Añadir Personalizado</p>
                  <div className="flex gap-2">
                    <Input placeholder="Nombre..." className="h-8 text-xs bg-white" value={customName} onChange={(e) => setCustomName(e.target.value)} />
                    <Input type="number" placeholder="Precio" className="h-8 text-xs w-24 bg-white" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} />
                    <Button size="sm" className="h-8 w-8 p-0 bg-indigo-600 shrink-0" onClick={addCustomToCart}><Plus className="w-4 h-4 text-white" /></Button>
                  </div>
                </div>

                <div className="p-3 space-y-3 border-b border-gray-100">
                  {cart.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center text-gray-400 space-y-2 opacity-40">
                      <ShoppingCart className="w-10 h-10" />
                      <p className="text-sm text-center">El carrito está vacío</p>
                    </div>
                  ) : (
                    cart.map(item => (
                      <div key={item.id} className={`flex flex-col p-3 rounded-lg border ${item.is_custom ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
                        <div className="flex justify-between mb-2">
                          <div className="flex items-center gap-2 flex-1">
                            <p className="font-medium text-xs md:text-sm text-gray-900 line-clamp-1">{item.name}</p>
                            {item.is_custom && <span className="text-[8px] bg-amber-200 text-amber-700 px-1 rounded uppercase font-black">CUST</span>}
                          </div>
                          <button onClick={() => removeFromCart(item.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-xs text-indigo-600 font-bold">{formatCurrency(item.price)}</p>
                          <div className="flex items-center gap-1 bg-white rounded-md border border-gray-200">
                            <button onClick={() => updateQuantity(item.id, -1)} className="p-1.5 hover:bg-gray-100"><Minus className="w-3 h-3" /></button>
                            <span className="text-xs w-6 text-center font-bold">{item.quantity}</span>
                            <button onClick={() => updateQuantity(item.id, 1)} className="p-1.5 hover:bg-gray-100"><Plus className="w-3 h-3" /></button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><User className="w-3 h-3" /> Cliente (opcional)</label>
                    <Input placeholder="Nombre del cliente..." className="h-9 text-xs bg-white" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">¿Generar Comprobante PDF?</label>
                    <select className="flex h-10 w-full rounded-xl border border-input bg-white px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-indigo-500" value={needsReceipt} onChange={e => setNeedsReceipt(e.target.value)}>
                      <option value="no">No, solo registrar</option>
                      <option value="yes">Sí, generar y abrir PDF</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Método de Pago</label>
                    <div className="grid grid-cols-2 gap-2">
                      {paymentMethods.map(method => (
                        <Button key={method.id} variant={selectedPaymentMethod?.id === method.id ? "default" : "outline"} onClick={() => setSelectedPaymentMethod(method)} className={`w-full text-[10px] h-auto py-2.5 flex flex-col border-gray-200 ${selectedPaymentMethod?.id === method.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white hover:bg-indigo-50'}`}>
                          <span className="font-bold truncate w-full px-1">{method.name}</span>
                          {Number(method.discount_percentage) > 0 && <span className="text-[9px] bg-green-500 text-white px-1.5 rounded-full">-{method.discount_percentage}%</span>}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-gray-200 bg-gray-50 space-y-4 shrink-0">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500 font-medium"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                  {discountPercent > 0 && <div className="flex justify-between text-xs text-green-600 font-bold"><span><Tag className="w-3 h-3 inline mr-1" /> Dcto ({discountPercent}%)</span><span>- {formatCurrency(discountAmount)}</span></div>}
                  <div className="flex justify-between items-center pt-2"><span className="text-gray-900 font-bold text-sm">Total</span><span className="text-xl md:text-2xl font-black text-indigo-700">{formatCurrency(total)}</span></div>
                </div>
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-sm md:text-lg h-12 font-bold shadow-lg" disabled={cart.length === 0 || isProcessing} onClick={handleCheckout}>
                  {isProcessing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <ShoppingCart className="mr-2 h-4 w-4" />} Confirmar Venta
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="flex-1 min-h-0 overflow-y-auto mt-0 px-1">
          <SalesHistoryPage />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SalesModule;