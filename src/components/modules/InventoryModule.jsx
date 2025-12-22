
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Package, Plus, Search, Trash2, Edit, Tag, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';
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
  const [activeTab, setActiveTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState('');
  
  // Dialog States
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Forms
  const [productForm, setProductForm] = useState({
    name: '',
    category_id: '',
    cost: 0,
    price: 0,
    stock: 0
  });

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: ''
  });

  useEffect(() => {
    if (branchId) {
      fetchCategories();
      fetchProducts();
    }
  }, [branchId]);

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('branch_id', branchId);
    if (!error) setCategories(data);
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('branch_id', branchId);
    if (!error) setProducts(data);
  };

  // --- Product Handlers ---
  const handleSaveProduct = async () => {
    if (!productForm.name || !productForm.category_id) {
      toast({ title: "Nombre y categoría son requeridos", variant: "destructive" });
      return;
    }

    try {
      const payload = { ...productForm, branch_id: branchId };
      let error;
      
      if (editingItem) {
        const { error: err } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingItem.id);
        error = err;
      } else {
        const { error: err } = await supabase
          .from('products')
          .insert([payload]);
        error = err;
      }

      if (error) throw error;

      toast({ title: editingItem ? "Producto actualizado" : "Producto creado" });
      fetchProducts();
      setIsProductDialogOpen(false);
      resetProductForm();
    } catch (err) {
      toast({ title: "Error al guardar", variant: "destructive" });
    }
  };

  const handleDeleteProduct = async (id) => {
    if(window.confirm("¿Eliminar producto?")) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (!error) {
        setProducts(products.filter(p => p.id !== id));
        toast({ title: "Producto eliminado" });
      }
    }
  };

  const openProductDialog = (product = null) => {
    if (product) {
      setEditingItem(product);
      setProductForm({
        name: product.name,
        category_id: product.category_id,
        cost: product.cost,
        price: product.price,
        stock: product.stock
      });
    } else {
      resetProductForm();
    }
    setIsProductDialogOpen(true);
  };

  const resetProductForm = () => {
    setEditingItem(null);
    setProductForm({ name: '', category_id: categories[0]?.id || '', cost: 0, price: 0, stock: 0 });
  };

  // --- Category Handlers ---
  const handleSaveCategory = async () => {
    if (!categoryForm.name) {
      toast({ title: "El nombre es requerido", variant: "destructive" });
      return;
    }

    try {
      const payload = { ...categoryForm, branch_id: branchId };
      let error;
      
      if (editingItem) {
        const { error: err } = await supabase
          .from('categories')
          .update(payload)
          .eq('id', editingItem.id);
        error = err;
      } else {
        const { error: err } = await supabase
          .from('categories')
          .insert([payload]);
        error = err;
      }

      if (error) throw error;

      toast({ title: editingItem ? "Categoría actualizada" : "Categoría creada" });
      fetchCategories();
      setIsCategoryDialogOpen(false);
      resetCategoryForm();
    } catch (err) {
      toast({ title: "Error al guardar", variant: "destructive" });
    }
  };

  const handleDeleteCategory = async (id) => {
    if (products.some(p => p.category_id === id)) {
      toast({ title: "No se puede eliminar", description: "Hay productos asignados a esta categoría", variant: "destructive" });
      return;
    }
    if(window.confirm("¿Eliminar categoría?")) {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (!error) {
        setCategories(categories.filter(c => c.id !== id));
        toast({ title: "Categoría eliminada" });
      }
    }
  };

  const openCategoryDialog = (category = null) => {
    if (category) {
      setEditingItem(category);
      setCategoryForm({ name: category.name, description: category.description });
    } else {
      resetCategoryForm();
    }
    setIsCategoryDialogOpen(true);
  };

  const resetCategoryForm = () => {
    setEditingItem(null);
    setCategoryForm({ name: '', description: '' });
  };

  // Filtering
  const getCategoryName = (id) => categories.find(c => c.id === id)?.name || 'Sin Categoría';
  
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(filter.toLowerCase()) || 
    getCategoryName(p.category_id).toLowerCase().includes(filter.toLowerCase())
  );

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Gestión de Stock</h1>
          <p className="text-gray-600">Administra inventario y categorías</p>
        </div>
        
        <div className="flex gap-2">
           {activeTab === 'products' ? (
             <Button onClick={() => openProductDialog()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
               <Plus className="w-4 h-4 mr-2" /> Nuevo Producto
             </Button>
           ) : (
             <Button onClick={() => openCategoryDialog()} className="bg-indigo-600 hover:bg-indigo-700 text-white">
               <Plus className="w-4 h-4 mr-2" /> Nueva Categoría
             </Button>
           )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('products')}
          className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
            activeTab === 'products' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4" /> Productos
          </div>
          {activeTab === 'products' && (
            <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`pb-3 px-1 text-sm font-medium transition-colors relative ${
            activeTab === 'categories' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4" /> Categorías
          </div>
          {activeTab === 'categories' && (
            <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
          )}
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex items-center gap-3 shadow-sm">
        <Search className="w-5 h-5 text-gray-400" />
        <input 
          placeholder={activeTab === 'products' ? "Buscar producto..." : "Buscar categoría..."}
          className="bg-transparent border-none outline-none text-gray-900 w-full placeholder-gray-400"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-semibold">
              <tr>
                <th className="p-4">Nombre</th>
                {activeTab === 'products' && (
                  <>
                    <th className="p-4">Categoría</th>
                    <th className="p-4">Costo</th>
                    <th className="p-4">Precio</th>
                    <th className="p-4">Stock</th>
                  </>
                )}
                {activeTab === 'categories' && <th className="p-4">Descripción</th>}
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeTab === 'products' && filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-medium text-gray-900 flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 rounded-lg">
                      <Package className="w-4 h-4 text-indigo-600" />
                    </div>
                    {product.name}
                  </td>
                  <td className="p-4 text-gray-600">
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs border border-gray-200">
                      {getCategoryName(product.category_id)}
                    </span>
                  </td>
                  <td className="p-4 text-gray-600">{formatCurrency(product.cost)}</td>
                  <td className="p-4 text-gray-600">{formatCurrency(product.price)}</td>
                  <td className="p-4">
                    <span className={`font-medium ${product.stock < 10 ? "text-red-600" : "text-green-600"}`}>
                      {product.stock} u.
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => openProductDialog(product)} size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-indigo-600">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button onClick={() => handleDeleteProduct(product.id)} size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {activeTab === 'categories' && filteredCategories.map((category) => (
                <tr key={category.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-medium text-gray-900 flex items-center gap-3">
                    <div className="p-2 bg-orange-50 rounded-lg">
                      <Tag className="w-4 h-4 text-orange-600" />
                    </div>
                    {category.name}
                  </td>
                  <td className="p-4 text-gray-600">{category.description || '-'}</td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => openCategoryDialog(category)} size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-indigo-600">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button onClick={() => handleDeleteCategory(category.id)} size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Dialog */}
      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className="bg-white text-gray-900 border-gray-200">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-gray-700">Nombre</label>
              <input 
                className="w-full p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={productForm.name}
                onChange={e => setProductForm({...productForm, name: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-gray-700">Categoría</label>
              <select 
                className="w-full p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={productForm.category_id}
                onChange={e => setProductForm({...productForm, category_id: e.target.value})}
              >
                <option value="">Seleccionar...</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-gray-700">Costo</label>
                <input 
                  type="number"
                  className="w-full p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={productForm.cost}
                  onChange={e => setProductForm({...productForm, cost: Number(e.target.value)})}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-gray-700">Precio</label>
                <input 
                  type="number"
                  className="w-full p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={productForm.price}
                  onChange={e => setProductForm({...productForm, price: Number(e.target.value)})}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-gray-700">Stock</label>
                <input 
                  type="number"
                  className="w-full p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  value={productForm.stock}
                  onChange={e => setProductForm({...productForm, stock: Number(e.target.value)})}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProductDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveProduct} className="bg-indigo-600 hover:bg-indigo-700 text-white">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="bg-white text-gray-900 border-gray-200">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Editar Categoría' : 'Nueva Categoría'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-gray-700">Nombre</label>
              <input 
                className="w-full p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={categoryForm.name}
                onChange={e => setCategoryForm({...categoryForm, name: e.target.value})}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-gray-700">Descripción</label>
              <textarea 
                rows="3"
                className="w-full p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={categoryForm.description}
                onChange={e => setCategoryForm({...categoryForm, description: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveCategory} className="bg-indigo-600 hover:bg-indigo-700 text-white">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default InventoryModule;
