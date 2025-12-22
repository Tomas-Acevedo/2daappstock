import React, { useEffect, useMemo, useState } from "react";
import { useScan } from "./ScanProvider";
import { supabase } from "@/lib/supabase";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

// ✅ mismo método de branchId por URL (sin Router context)
const getBranchIdFromPath = () => {
  try {
    const path = window.location.pathname || "";
    const m = path.match(/\/branch\/([^/]+)/i);
    return m?.[1] || null;
  } catch {
    return null;
  }
};

export default function ScanDialog() {
  const { isOpen, close, barcode, loading, error, matches, setSelected, openWithCode } =
    useScan();

  const branchId = getBranchIdFromPath();

  const [viewProduct, setViewProduct] = useState(null);

  // UI "no encontrado"
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // crear nuevo
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newStock, setNewStock] = useState("0");

  const noMatches = !loading && !error && (matches?.length || 0) === 0;

  useEffect(() => {
    if (!isOpen) return;
    if (matches?.length === 1) {
      setViewProduct(matches[0]);
      setSelected(matches[0]);
    } else {
      setViewProduct(null);
    }
  }, [isOpen, matches, setSelected]);

  const handleClose = () => {
    close();
    setViewProduct(null);
    setSearch("");
    setProducts([]);
    setNewName("");
    setNewPrice("");
    setNewStock("0");
  };

  const fetchProducts = async () => {
    if (!branchId) return;
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,price,stock,barcode,branch_id")
        .eq("branch_id", branchId)
        .order("name", { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (e) {
      console.error(e);
      toast({ title: "No se pudieron cargar productos", variant: "destructive" });
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (noMatches) fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, noMatches]);

  const filteredProducts = useMemo(() => {
    const s = (search || "").trim().toLowerCase();
    if (!s) return products;
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(s) ||
        (p.barcode || "").toLowerCase().includes(s)
    );
  }, [products, search]);

  const associateBarcode = async (product) => {
    if (!branchId || !barcode) return;
    try {
      const { data, error } = await supabase
        .from("products")
        .update({ barcode })
        .eq("id", product.id)
        .eq("branch_id", branchId)
        .select("id,name,price,stock,barcode,branch_id")
        .single();

      if (error) throw error;

      toast({
        title: "Código asociado",
        description: `Se vinculó ${barcode} a "${data.name}"`,
      });

      openWithCode(barcode);
    } catch (e) {
      console.error(e);
      toast({ title: "No se pudo asociar el código", variant: "destructive" });
    }
  };

  const createProductWithBarcode = async () => {
    if (!branchId || !barcode) return;

    const name = newName.trim();
    const price = Number(String(newPrice || "0").replace(/[^\d]/g, ""));
    const stock = Number(String(newStock || "0").replace(/[^\d]/g, ""));

    if (!name) {
      toast({ title: "Poné un nombre", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("products")
        .insert([
          {
            name,
            price: Number.isFinite(price) ? price : 0,
            stock: Number.isFinite(stock) ? stock : 0,
            barcode,
            branch_id: branchId,
          },
        ])
        .select("id,name,price,stock,barcode,branch_id")
        .single();

      if (error) throw error;

      toast({
        title: "Producto creado",
        description: `"${data.name}" vinculado a ${barcode}`,
      });

      openWithCode(barcode);
    } catch (e) {
      console.error(e);
      toast({ title: "No se pudo crear el producto", variant: "destructive" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (o ? null : handleClose())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Escaneo: <span className="font-mono">{barcode || "—"}</span>
          </DialogTitle>
        </DialogHeader>

        {!branchId && (
          <div className="text-sm text-red-600">
            No se detectó <b>branchId</b>. Abrí el escaneo dentro de una ruta tipo{" "}
            <span className="font-mono">/branch/:branchId/...</span>
          </div>
        )}

        {loading && <div className="text-sm text-gray-500">Buscando producto…</div>}
        {error && <div className="text-sm text-red-600">{String(error)}</div>}

        {/* ✅ Encontrado 1 */}
        {!loading && !error && viewProduct && (
          <div className="space-y-3">
            <div className="rounded-xl border p-4">
              <div className="text-xl font-bold">{viewProduct.name}</div>
              <div className="text-sm text-gray-500">
                Precio:{" "}
                <b>${Number(viewProduct.price || 0).toLocaleString("es-AR")}</b>
                {" · "}
                Stock: <b>{viewProduct.stock ?? 0}</b>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Barcode: {viewProduct.barcode || "—"}
              </div>
            </div>
          </div>
        )}

        {/* ❌ No encontrado */}
        {branchId && noMatches && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border p-4">
              <div className="font-bold mb-2">Asociar a producto existente</div>
              <Input
                placeholder="Buscar por nombre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <div className="mt-3 max-h-[320px] overflow-auto space-y-2">
                {loadingProducts ? (
                  <div className="text-sm text-gray-500">Cargando productos…</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-sm text-gray-500">Sin resultados</div>
                ) : (
                  filteredProducts.slice(0, 50).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => associateBarcode(p)}
                      className="w-full text-left rounded-lg border p-2 hover:bg-gray-50"
                    >
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-xs text-gray-500">
                        Stock: {p.stock ?? 0} · $
                        {Number(p.price || 0).toLocaleString("es-AR")}
                        {p.barcode ? ` · Código actual: ${p.barcode}` : ""}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <div className="font-bold mb-2">Crear producto nuevo</div>

              <div className="space-y-2">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Nombre</div>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>

                <div>
                  <div className="text-xs text-gray-500 mb-1">Precio</div>
                  <Input
                    inputMode="numeric"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div>
                  <div className="text-xs text-gray-500 mb-1">Stock</div>
                  <Input
                    inputMode="numeric"
                    value={newStock}
                    onChange={(e) => setNewStock(e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className="text-xs text-gray-500">
                  Código a vincular: <span className="font-mono">{barcode}</span>
                </div>

                <Button onClick={createProductWithBarcode} className="w-full">
                  Crear y vincular
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
