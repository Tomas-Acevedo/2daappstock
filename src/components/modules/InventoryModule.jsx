import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Package, Plus, Search, Trash2, Edit, ShieldCheck,
  Loader2, Layers, ChevronLeft, ChevronRight, Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const InventoryModule = () => {
  const { branchId } = useParams();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [branchConfig, setBranchConfig] = useState(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // ✅ OPTIMIZACIÓN (SERVIDOR)
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 20;

  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [productForm, setProductForm] = useState({
    name: '', category_id: '', price: 0, stock: 0, barcode: ''
  });
  const [categoryForm, setCategoryForm] = useState({ name: '' });

  const isOwner = user?.profile?.role === 'owner';
  const canEdit = isOwner || (branchConfig?.allow_stock_edit === true);

  // Funciones auxiliares para el formato visual 3.000 en el input
  const formatNumberWithDots = (num) => {
    if (num === undefined || num === null || num === '') return '';
    return num.toString().replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const parseNumberFromDots = (str) => {
    return Number((str || "").replace(/\./g, ""));
  };

  // =========================
  // FETCHES
  // =========================
  const fetchCategories = useCallback(async () => {
    if (!branchId) return;
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('branch_id', branchId)
      .order('name');

    if (!error) setCategories(data || []);
  }, [branchId]);

  const fetchProducts = useCallback(async () => {
    if (!branchId) return;
    if (activeTab !== 'products') return;

    setLoading(true);

    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;

    let query = supabase
      .from('products')
      .select('*', { count: 'exact' })
      .eq('branch_id', branchId)
      .order('name', { ascending: true })
      .range(from, to);

    if (filter) {
      query = query.or(`name.ilike.%${filter}%,barcode.ilike.%${filter}%`);
    }

    if (categoryFilter !== 'all') {
      query = query.eq('category_id', categoryFilter);
    }

    if (stockFilter === 'in-stock') {
      query = query.gt('stock', 0);
    } else if (stockFilter === 'no-stock') {
      query = query.lte('stock', 0);
    }

    const { data, count, error } = await query;

    if (!error) {
      setProducts(data || []);
      setTotalCount(count || 0);
    }

    setLoading(false);
  }, [branchId, currentPage, filter, categoryFilter, stockFilter, activeTab]);

  // =========================
  // INIT
  // =========================
  useEffect(() => {
    const loadInitialData = async () => {
      const [configRes] = await Promise.all([
        supabase.from('branches').select('allow_stock_edit').eq('id', branchId).single(),
      ]);

      setBranchConfig(configRes.data);
      await fetchCategories(); // ✅ siempre cargar categorías
    };

    if (branchId) loadInitialData();
  }, [branchId, fetchCategories]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    const handleRefresh = () => fetchProducts();
    window.addEventListener('inventory:refresh', handleRefresh);
    return () => window.removeEventListener('inventory:refresh', handleRefresh);
  }, [fetchProducts]);

  // =========================
  // REALTIME: PRODUCTS
  // =========================
  useEffect(() => {
    if (!branchId) return;
    if (activeTab !== "products") return;

    const channel = supabase
      .channel(`realtime:products:${branchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `branch_id=eq.${branchId}`,
        },
        () => {
          fetchProducts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId, activeTab, fetchProducts]);

  // =========================
  // REALTIME: CATEGORIES
  // =========================
  useEffect(() => {
    if (!branchId) return;
    if (activeTab !== "categories") return;

    const channel = supabase
      .channel(`realtime:categories:${branchId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "categories",
          filter: `branch_id=eq.${branchId}`,
        },
        () => {
          fetchCategories();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId, activeTab, fetchCategories]);

  // reset página al cambiar filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, categoryFilter, stockFilter]);

  // =========================
  // UI DATA
  // =========================
  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(filter.toLowerCase())
  );

  // =========================
  // ACTIONS: PRODUCTS
  // =========================
  const openProductDialog = (product = null) => {
    if (product) {
      setEditingItem(product);
      setProductForm({
        name: product.name,
        category_id: product.category_id,
        price: product.price,
        stock: product.stock,
        barcode: product.barcode || ''
      });
    } else {
      setEditingItem(null);
      setProductForm({
        name: '',
        category_id: categories[0]?.id || '',
        price: 0,
        stock: 0,
        barcode: ''
      });
    }
    setIsProductDialogOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!canEdit) return;
    if (!productForm.name || !productForm.category_id) {
      toast({ title: "Faltan datos", variant: "destructive" });
      return;
    }

    const payload = { ...productForm, branch_id: branchId };

    const { error } = editingItem
      ? await supabase.from('products').update(payload).eq('id', editingItem.id)
      : await supabase.from('products').insert([payload]);

    if (error) {
      toast({ title: "Error al guardar", variant: "destructive" });
      return;
    }

    toast({ title: "Inventario actualizado" });
    setIsProductDialogOpen(false);
    // opcional: mejora UX en la pestaña actual
    fetchProducts();
  };

  const handleDeleteProduct = async (id) => {
    if (!canEdit || !window.confirm("¿Eliminar producto?")) return;

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      toast({ title: "Error al eliminar", variant: "destructive" });
      return;
    }

    toast({ title: "Producto eliminado" });
    // opcional: mejora UX en la pestaña actual
    fetchProducts();
  };

  // =========================
  // ACTIONS: CATEGORIES
  // =========================
  const openCategoryDialog = (cat = null) => {
    if (cat) {
      setEditingItem(cat);
      setCategoryForm({ name: cat.name });
    } else {
      setEditingItem(null);
      setCategoryForm({ name: '' });
    }
    setIsCategoryDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!canEdit) return;
    if (!categoryForm.name?.trim()) {
      toast({ title: "Faltan datos", variant: "destructive" });
      return;
    }

    const payload = { ...categoryForm, name: categoryForm.name.trim(), branch_id: branchId };

    const { error } = editingItem
      ? await supabase.from('categories').update(payload).eq('id', editingItem.id)
      : await supabase.from('categories').insert([payload]);

    if (error) {
      toast({ title: "Error al guardar", variant: "destructive" });
      return;
    }

    toast({ title: editingItem ? "Categoría actualizada" : "Categoría creada" });
    setIsCategoryDialogOpen(false);
    // opcional: mejora UX en la pestaña actual
    fetchCategories();
  };

  const handleDeleteCategory = async (id) => {
    if (!canEdit || !window.confirm("¿Eliminar categoría?")) return;

    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) {
      toast({ title: "Error al eliminar", variant: "destructive" });
      return;
    }

    toast({ title: "Categoría eliminada" });
    // opcional: mejora UX en la pestaña actual
    fetchCategories();
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gestión de Stock</h1>
          {!canEdit && !loading && (
            <p className="text-amber-600 text-sm font-semibold flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100 mt-1">
              <ShieldCheck className="w-4 h-4" /> Modo Lectura
            </p>
          )}
        </div>

        <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'products' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
          >
            <Package className="w-4 h-4" /> PRODUCTOS
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-2 ${activeTab === 'categories' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
          >
            <Layers className="w-4 h-4" /> CATEGORÍAS
          </button>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-4 mb-6">
        <div className="flex-1 bg-white rounded-2xl border border-gray-200 p-3 flex items-center gap-3 shadow-sm">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            placeholder={activeTab === 'products' ? "Buscar por nombre o código..." : "Filtrar categorías..."}
            className="bg-transparent border-none outline-none text-gray-900 w-full font-medium"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {activeTab === 'products' && (
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-2xl border border-gray-200 shadow-sm">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                className="bg-transparent border-none text-xs font-bold outline-none text-gray-600 py-2 cursor-pointer"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">Todas las Categorías</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-2xl border border-gray-200 shadow-sm">
              <select
                className="bg-transparent border-none text-xs font-bold outline-none text-gray-600 py-2 cursor-pointer"
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
              >
                <option value="all">Todo el Stock</option>
                <option value="in-stock">Con Stock</option>
                <option value="no-stock">Sin Stock (0)</option>
              </select>
            </div>
          </div>
        )}

        {canEdit && (
          <Button
            onClick={() => activeTab === 'products' ? openProductDialog() : openCategoryDialog()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black py-6 rounded-2xl px-8 shadow-lg shadow-indigo-100 uppercase text-xs tracking-widest"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo {activeTab === 'products' ? 'Producto' : 'Categoría'}
          </Button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm tabular-nums">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/50 text-gray-500 uppercase text-[10px] font-black tracking-widest border-b">
              <tr>
                <th className="px-6 py-4">Nombre</th>
                {activeTab === 'products' && (
                  <>
                    <th className="px-6 py-4 text-center">Código</th>
                    <th className="px-6 py-4">Precio</th>
                    <th className="px-6 py-4 text-center">Stock</th>
                  </>
                )}
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-20 text-center">
                    <Loader2 className="animate-spin mx-auto text-indigo-600 w-8 h-8" />
                  </td>
                </tr>
              ) : (activeTab === 'products' ? products : filteredCategories).map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900">{item.name}</td>

                  {activeTab === 'products' && (
                    <>
                      <td className="px-6 py-4 text-center">
                        {item.barcode
                          ? <span className="bg-gray-100 px-2 py-1 rounded-md font-mono text-[10px] font-bold text-gray-600 border border-gray-200">{item.barcode}</span>
                          : '-'}
                      </td>
                      <td className="px-6 py-4 font-black text-indigo-600">{formatCurrency(item.price)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded text-[10px] font-black ${item.stock <= 5 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                          {item.stock} U.
                        </span>
                      </td>
                    </>
                  )}

                  <td className="px-6 py-4 text-right">
                    {canEdit ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          onClick={() => activeTab === 'products' ? openProductDialog(item) : openCategoryDialog(item)}
                          size="icon"
                          variant="ghost"
                          className="hover:text-indigo-600"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>

                        <Button
                          onClick={() => activeTab === 'products' ? handleDeleteProduct(item.id) : handleDeleteCategory(item.id)}
                          size="icon"
                          variant="ghost"
                          className="hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-gray-300 font-bold uppercase italic">Bloqueado</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && activeTab === 'products' && totalPages > 1 && (
            <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/30">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-tighter">Total: {totalCount} productos</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-xl h-9 w-9 p-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl border">
                  PÁGINA {currentPage} DE {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-xl h-9 w-9 p-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PRODUCT DIALOG */}
      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className="bg-white sm:max-w-md rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Gestionar Producto</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-xs font-bold uppercase text-gray-400">Código</label>
              <Input
                value={productForm.barcode}
                onChange={e => setProductForm({ ...productForm, barcode: e.target.value })}
                placeholder="Opcional"
                className="rounded-xl"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-bold uppercase text-gray-400">Nombre</label>
              <Input
                value={productForm.name}
                onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-bold uppercase text-gray-400">Categoría</label>
              <select
                className="w-full p-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500"
                value={productForm.category_id}
                onChange={e => setProductForm({ ...productForm, category_id: e.target.value })}
              >
                <option value="">Seleccionar...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-indigo-400 uppercase">Precio</label>
                <Input
                  type="text"
                  value={formatNumberWithDots(productForm.price)}
                  onFocus={e => e.target.select()}
                  onChange={e => setProductForm({ ...productForm, price: parseNumberFromDots(e.target.value) })}
                  className="border-indigo-100 bg-indigo-50/30 font-bold text-indigo-700 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase">Stock</label>
                <Input
                  type="number"
                  value={productForm.stock}
                  onFocus={e => e.target.select()}
                  onChange={e => setProductForm({ ...productForm, stock: Number(e.target.value) })}
                  className="rounded-xl"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleSaveProduct}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-6 rounded-xl uppercase text-xs"
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CATEGORY DIALOG */}
      <Dialog
        open={isCategoryDialogOpen}
        onOpenChange={(open) => {
          setIsCategoryDialogOpen(open);
          if (!open) {
            setEditingItem(null);
            setCategoryForm({ name: '' });
          }
        }}
      >
        <DialogContent className="bg-white sm:max-w-sm rounded-2xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">
              {editingItem ? 'Editar' : 'Nueva'} Categoría
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <label className="text-[10px] font-black uppercase text-gray-400 ml-1">Nombre</label>
            <Input
              value={categoryForm.name}
              onChange={e => setCategoryForm({ name: e.target.value })}
              placeholder="Ej: Accesorios"
              className="rounded-xl h-12"
            />
          </div>

          <DialogFooter>
            <Button
              onClick={handleSaveCategory}
              className="w-full bg-indigo-600 text-white font-black py-6 rounded-xl shadow-lg uppercase text-xs"
            >
              Actualizar Categoría
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default InventoryModule;
