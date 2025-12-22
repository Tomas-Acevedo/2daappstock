import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SalesHistoryPage from './SalesHistoryPage';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ShoppingCart, Trash2, Plus, Minus, Loader2, Tag, Receipt } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const SalesModule = () => {
  const { branchId } = useParams();
  const [activeTab, setActiveTab] = useState("new-sale");
  
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [branchDetails, setBranchDetails] = useState(null);
  const [isTicketDialogOpen, setIsTicketDialogOpen] = useState(false);

  useEffect(() => {
    if (branchId) {
      fetchProductsAndCategories();
      fetchPaymentMethods();
      fetchBranchDetails();
    }
  }, [branchId]);

  const fetchBranchDetails = async () => {
    const { data } = await supabase.from('branches').select('name').eq('id', branchId).single();
    if (data) setBranchDetails(data);
  };
  
  const fetchProductsAndCategories = async () => {
    try {
      setLoading(true);
      const { data: cats } = await supabase.from('categories').select('*').eq('branch_id', branchId);
      const { data: prods } = await supabase.from('products').select('*, categories(name)').eq('branch_id', branchId);
      setCategories(cats || []);
      setProducts(prods || []);
    } catch (error) {
      toast({ title: "Error cargando productos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchPaymentMethods = async () => {
    const { data } = await supabase.from('payment_methods').select('*').eq('branch_id', branchId).eq('is_active', true).order('name', { ascending: true });
    if (data && data.length > 0) {
      setPaymentMethods(data);
      setSelectedPaymentMethod(data[0]);
    }
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
      return [...prev, { ...product, quantity: 1 }];
    });
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
      const { data: sale, error: saleError } = await supabase.from('sales').insert([{
        branch_id: branchId,
        customer_name: 'Cliente General',
        total: total,
        payment_method: selectedPaymentMethod.name,
        receipt_generated: false
      }]).select().single();
      if (saleError) throw saleError;

      const saleItems = cart.map(item => ({
        sale_id: sale.id, product_id: item.id, product_name: item.name,
        quantity: item.quantity, unit_price: item.price, is_custom: false
      }));
      const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
      if (itemsError) throw itemsError;

      for (const item of cart) {
        const { data: currentProd } = await supabase.from('products').select('stock').eq('id', item.id).single();
        if(currentProd) {
          await supabase.from('products').update({ stock: currentProd.stock - item.quantity }).eq('id', item.id);
        }
      }

      toast({ title: "Venta realizada con éxito" });
      setLastSale({ ...sale, sale_items: saleItems, payment_method: selectedPaymentMethod.name });
      setIsTicketDialogOpen(true);
      setCart([]);
      fetchProductsAndCategories();
    } catch (error) {
      toast({ title: "Error al procesar", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const printTicket = (sale) => {
    const ticketContent = `
      <html><head><title>Ticket</title><style>body{font-family:'Courier New',monospace;font-size:12px;max-width:300px;margin:0 auto;padding:10px}h3,p{margin:0}.header{text-align:center;margin-bottom:10px}.divider{border-top:1px dashed #000;margin:10px 0}.item,.total{display:flex;justify-content:space-between}.item{margin-bottom:5px}.total{font-weight:700;font-size:14px;margin-top:10px}.footer{text-align:center;margin-top:20px;font-size:10px}img{display:block;margin:10px auto;width:80px;height:80px}</style></head><body>
      <div class="header"><h3>${branchDetails?.name || 'Sucursal'}</h3><p>${formatDateTime(sale.created_at)}</p></div><div class="divider"></div>
      ${sale.sale_items.map(item=>`<div class="item"><span>${item.quantity}x ${item.product_name}</span><span>$${(item.unit_price*item.quantity).toLocaleString('es-AR')}</span></div>`).join('')}
      <div class="divider"></div><div class="total"><span>TOTAL</span><span>${formatCurrency(sale.total)}</span></div>
      <script>window.onload=function(){window.print();window.close()}</script></body></html>
    `;
    const printWindow = window.open('','','height=600,width=400');
    printWindow.document.write(ticketContent);
    printWindow.document.close();
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <>
    {/* Ajuste de altura para que en móvil no se pierda el final */}
    <div className="min-h-screen lg:h-[calc(100vh-100px)] flex flex-col pb-20 lg:pb-0">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col h-full">
        
        {/* Cabecera Responsiva */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6 shrink-0 px-1">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">Punto de Venta</h2>
          <TabsList className="grid w-full md:w-[400px] grid-cols-2 bg-gray-100">
            <TabsTrigger value="new-sale">Nueva Venta</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="new-sale" className="flex-1 overflow-hidden mt-0">
          {/* Grid Principal: Stack en móvil, Columnas en PC */}
          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 h-full overflow-y-auto lg:overflow-hidden px-1">
            
            {/* Sección de Productos */}
            <div className="order-2 lg:order-1 lg:col-span-8 flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-3 md:p-4 border-b border-gray-100 bg-gray-50/50 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input placeholder="Buscar productos..." className="pl-9 bg-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                {/* Categorías con Scroll Horizontal */}
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
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center text-gray-400 mt-10">No hay productos</div>
                ) : (
                  /* Grid de Cards: 2 columnas en móvil, 3 en PC */
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                    {filteredProducts.map(product => (
                      <Card key={product.id} className="cursor-pointer hover:border-indigo-500 transition-all active:scale-95 group" onClick={() => addToCart(product)}>
                        <CardContent className="p-3 md:p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-[10px] md:text-xs">{product.name.substring(0, 2).toUpperCase()}</div>
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
            </div>

            {/* Carrito de Venta */}
            <div className="order-1 lg:order-2 lg:col-span-4 flex flex-col h-auto lg:h-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-h-[400px]">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-900">Carrito de Venta</h3>
                {cart.length > 0 && <span className="ml-auto bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full">{cart.length}</span>}
              </div>

              <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 max-h-[300px] lg:max-h-none">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 py-10 space-y-2 opacity-40">
                    <ShoppingCart className="w-12 h-12" />
                    <p className="text-sm text-center">El carrito está vacío</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="flex flex-col bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <div className="flex justify-between mb-2">
                        <p className="font-medium text-xs md:text-sm text-gray-900 flex-1 pr-2">{item.name}</p>
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

              {/* Métodos de Pago y Total */}
              <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Método de Pago</label>
                  <div className="grid grid-cols-2 gap-2">
                    {paymentMethods.map(method => (
                      <Button 
                        key={method.id} 
                        variant={selectedPaymentMethod?.id === method.id ? "default" : "outline"} 
                        onClick={() => setSelectedPaymentMethod(method)} 
                        className={`w-full text-[10px] h-auto py-2.5 flex flex-col items-center gap-1 border-gray-200 ${selectedPaymentMethod?.id === method.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white hover:bg-indigo-50'}`}
                      >
                        <span className="font-bold truncate w-full px-1">{method.name}</span>
                        {Number(method.discount_percentage) > 0 && <span className="text-[9px] bg-green-500 text-white px-1.5 rounded-full">-{method.discount_percentage}%</span>}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-200 space-y-1">
                   <div className="flex justify-between items-center text-xs text-gray-500 font-medium"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                   {discountPercent > 0 && <div className="flex justify-between items-center text-xs text-green-600 font-bold"><span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Descuento ({discountPercent}%)</span><span>- {formatCurrency(discountAmount)}</span></div>}
                   <div className="flex justify-between items-center pt-2"><span className="text-gray-900 font-bold text-sm">Total a Pagar</span><span className="text-xl md:text-2xl font-black text-indigo-700">{formatCurrency(total)}</span></div>
                </div>

                <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-sm md:text-lg h-12 font-bold shadow-lg shadow-indigo-100 active:scale-95 transition-transform" disabled={cart.length === 0 || isProcessing} onClick={handleCheckout}>
                  {isProcessing ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
                  Confirmar Venta
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="history" className="flex-1 overflow-hidden mt-0 px-1">
          <div className="h-full overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-sm">
            <SalesHistoryPage />
          </div>
        </TabsContent>
      </Tabs>
    </div>
    
    {/* Diálogo de éxito ajustado */}
    <Dialog open={isTicketDialogOpen} onOpenChange={setIsTicketDialogOpen}>
      <DialogContent className="max-w-[90%] md:max-w-md rounded-2xl">
        <DialogHeader><DialogTitle className="text-center">¡Venta Exitosa!</DialogTitle></DialogHeader>
        <div className="text-center py-4 md:py-6">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Receipt className="w-8 h-8" />
          </div>
          <p className="text-sm md:text-lg font-medium text-gray-600">La transacción ha sido registrada.</p>
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="w-full" onClick={() => setIsTicketDialogOpen(false)}>Cerrar</Button>
          <Button className="w-full bg-indigo-600" onClick={() => { if(lastSale) printTicket(lastSale) }}>
            <Receipt className="w-4 h-4 mr-2"/> Ver Ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default SalesModule;