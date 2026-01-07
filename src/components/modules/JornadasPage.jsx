import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/customSupabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { format, differenceInMinutes, parseISO } from "date-fns";
import {
  Loader2,
  Clock,
  LogIn,
  LogOut,
  Trash2,
  Plus,
  Timer,
  Edit,
  CloudOff,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useOffline } from "@/contexts/OfflineContext";
import { initOfflineDb, enqueueAction, cacheEmployees, cacheAttendance } from "@/lib/offlineDb";

const JornadasPage = () => {
  const { branchId } = useParams();
  const { user } = useAuth();
  const { online, refreshPending } = useOffline();
  const isOwner = user?.profile?.role === "owner";

  const [employees, setEmployees] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [isInProgress, setIsInProgress] = useState(false);

  const [filters, setFilters] = useState({
    start: format(new Date(), "yyyy-MM-dd"),
    end: format(new Date(), "yyyy-MM-dd"),
  });

  const [formData, setFormData] = useState({
    employee_id: "",
    date: format(new Date(), "yyyy-MM-dd"),
    clock_in: "09:00",
    clock_out: "",
  });

  useEffect(() => {
    fetchData();
  }, [branchId, filters.start, filters.end, online]);

  useEffect(() => {
    const handleSyncRefresh = () => {
      fetchData();
    };
    window.addEventListener("offline:sync-complete", handleSyncRefresh);
    window.addEventListener("attendance:refresh", handleSyncRefresh); 
    return () => {
      window.removeEventListener("offline:sync-complete", handleSyncRefresh);
      window.removeEventListener("attendance:refresh", handleSyncRefresh);
    };
  }, [branchId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const db = await initOfflineDb();
      if (online) {
        const { data: emps } = await supabase
          .from("employees")
          .select("*")
          .eq("branch_id", branchId)
          .eq("is_active", true);

        setEmployees(emps || []);
        if (emps) await cacheEmployees(emps);

        let query = supabase
          .from("attendance_logs")
          .select("*, employees(name)")
          .eq("branch_id", branchId);

        if (isOwner) {
          query = query.gte("date", filters.start).lte("date", filters.end);
        } else {
          query = query.eq("date", format(new Date(), "yyyy-MM-dd"));
        }

        const { data: attendance } = await query.order("clock_in", { ascending: false });
        setLogs(attendance || []);
        if (attendance) await cacheAttendance(attendance);
      } else {
        const emps = (await db.getAllFromIndex("employees", "branch_id", branchId)).filter((e) => e.is_active);
        setEmployees(emps);
        const allLogs = await db.getAllFromIndex("attendance_logs", "branch_id", branchId);
        let filtered = allLogs;
        if (isOwner) {
          filtered = allLogs.filter((l) => l.date >= filters.start && l.date <= filters.end);
        } else {
          filtered = allLogs.filter((l) => l.date === format(new Date(), "yyyy-MM-dd"));
        }
        const enriched = filtered.map((l) => ({
          ...l,
          employees: { name: emps.find((e) => e.id === l.employee_id)?.name || "Empleado" },
        }));
        enriched.sort((a, b) => String(b.clock_in || "").localeCompare(String(a.clock_in || "")));
        setLogs(enriched);
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Error cargando datos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const calculateTime = (start, end) => {
    if (!start || !end) return { text: "--", minutes: 0 };
    const mins = differenceInMinutes(new Date(end), new Date(start));
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return { text: `${h}h ${m}m`, minutes: mins };
  };

  const totalMinutes = logs.reduce((acc, log) => acc + calculateTime(log.clock_in, log.clock_out).minutes, 0);

  const formatTotalTime = (totalMins) => {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h} horas y ${m} minutos`;
  };

  const saveToIdbAttendance = async (row) => {
    const db = await initOfflineDb();
    const clean = { ...(row || {}) };
    delete clean.employees;
    await db.put("attendance_logs", clean);
  };

  const handleClockAction = async (employeeId, action) => {
    const today = format(new Date(), "yyyy-MM-dd");
    if (action === "in") {
      const payload = {
        id: `local-att-${Date.now()}`,
        employee_id: employeeId,
        branch_id: branchId,
        clock_in: new Date().toISOString(),
        clock_out: null,
        date: today,
      };
      if (online) {
        const { id, ...insertRow } = payload;
        const { data: created, error } = await supabase.from("attendance_logs").insert([insertRow]).select().single();
        if (!error && created) {
          await saveToIdbAttendance(created);
          toast({ title: "Entrada registrada" });
          await refreshPending();
          await fetchData();
          return;
        }
      }
      const db = await initOfflineDb();
      await db.put("attendance_logs", payload);
      await enqueueAction({ type: "attendance:create", payload });
      toast({ title: "Entrada registrada localmente" });
      await refreshPending();
      await fetchData();
      return;
    }

    const openLog = logs.find((l) => l.employee_id === employeeId && !l.clock_out && l.date === today);
    if (!openLog) return;
    const cleanOpen = { ...openLog };
    delete cleanOpen.employees;
    const updated = { ...cleanOpen, clock_out: new Date().toISOString() };

    if (online && typeof updated.id === "string" && !updated.id.startsWith("local-")) {
      const { id, ...patch } = updated;
      const { error } = await supabase.from("attendance_logs").update(patch).eq("id", id);
      if (!error) {
        await saveToIdbAttendance(updated);
        toast({ title: "Salida registrada" });
        await refreshPending();
        await fetchData();
        return;
      }
    }
    const db = await initOfflineDb();
    await db.put("attendance_logs", updated);
    await enqueueAction({ type: "attendance:update", payload: updated });
    toast({ title: "Salida registrada localmente" });
    await refreshPending();
    await fetchData();
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setIsInProgress(false);
    setFormData({
      employee_id: "",
      date: format(new Date(), "yyyy-MM-dd"),
      clock_in: "09:00",
      clock_out: "",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (log) => {
    setEditingId(log.id);
    const inProgress = !log.clock_out;
    setIsInProgress(inProgress);
    setFormData({
      employee_id: log.employee_id,
      date: log.date,
      clock_in: format(new Date(log.clock_in), "HH:mm"),
      clock_out: log.clock_out ? format(new Date(log.clock_out), "HH:mm") : "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    // Validación: Salida ahora es opcional si está vacía
    if (!formData.employee_id || !formData.date || !formData.clock_in) {
      toast({ title: "Faltan datos obligatorios", variant: "destructive" });
      return;
    }

    const inDateTime = new Date(`${formData.date}T${formData.clock_in}:00`).toISOString();
    const outDateTime = formData.clock_out && formData.clock_out.trim() !== ""
      ? new Date(`${formData.date}T${formData.clock_out}:00`).toISOString()
      : null;

    const localId = editingId || `local-man-${Date.now()}`;
    const payload = {
      id: localId,
      employee_id: formData.employee_id,
      branch_id: branchId,
      date: formData.date,
      clock_in: inDateTime,
      clock_out: outDateTime,
    };

    if (online && editingId && typeof editingId === "string" && !editingId.startsWith("local-")) {
      const { id, ...patch } = payload;
      const { error } = await supabase.from("attendance_logs").update(patch).eq("id", id);
      if (!error) {
        await saveToIdbAttendance(payload);
        toast({ title: "Jornada actualizada" });
        setIsDialogOpen(false);
        await refreshPending();
        await fetchData();
        return;
      }
    }

    if (online && (!editingId || (typeof localId === "string" && localId.startsWith("local-")))) {
      const { id, ...insertRow } = payload;
      const { data: created, error } = await supabase.from("attendance_logs").insert([insertRow]).select().single();
      if (!error && created) {
        await saveToIdbAttendance(created);
        toast({ title: "Jornada guardada" });
        setIsDialogOpen(false);
        await refreshPending();
        await fetchData();
        return;
      }
    }

    const db = await initOfflineDb();
    await db.put("attendance_logs", payload);
    await enqueueAction({ type: editingId ? "attendance:update" : "attendance:create", payload });
    toast({ title: editingId ? "Actualizado localmente" : "Guardado localmente" });
    setIsDialogOpen(false);
    await refreshPending();
    await fetchData();
  };

  const deleteLog = async (id) => {
    if (!isOwner || !confirm("¿Eliminar registro?")) return;
    if (!online) {
      const db = await initOfflineDb();
      await db.delete("attendance_logs", id);
      await enqueueAction({ type: "attendance:delete", payload: { id } });
      toast({ title: "Eliminado localmente" });
      await refreshPending();
      await fetchData();
      return;
    }
    const { error } = await supabase.from("attendance_logs").delete().eq("id", id);
    if (!error) {
      const db = await initOfflineDb();
      await db.delete("attendance_logs", id);
      toast({ title: "Registro eliminado" });
      await refreshPending();
      await fetchData();
    }
  };

  if (loading) return <div className="h-96 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" /></div>;

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6 tabular-nums">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
            <Clock className="text-indigo-600" /> Control de Jornadas
            {!online && <CloudOff className="w-5 h-5 text-amber-500" />}
          </h1>
          {isOwner && (
            <p className="text-sm text-gray-500 font-medium mt-1 italic">
              Total trabajado: <span className="text-indigo-600 font-bold">{formatTotalTime(totalMinutes)}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <>
              <Button onClick={openCreateDialog} className="bg-indigo-600 hover:bg-indigo-700"><Plus className="w-4 h-4 mr-2" /> Manual</Button>
              <div className="flex items-center gap-2 bg-white p-2 rounded-lg border shadow-sm">
                <Input type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} className="h-8 border-none focus-visible:ring-0 text-xs font-bold" />
                <span className="text-gray-400">-</span>
                <Input type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} className="h-8 border-none focus-visible:ring-0 text-xs font-bold" />
              </div>
            </>
          )}
        </div>
      </div>

      {!isOwner && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {employees.map((emp) => {
            const isClockedIn = logs.some(l => l.employee_id === emp.id && !l.clock_out && l.date === format(new Date(), "yyyy-MM-dd"));
            return (
              <div key={emp.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center space-y-4">
                <p className="font-black text-xl text-gray-800">{emp.name}</p>
                <Button onClick={() => handleClockAction(emp.id, isClockedIn ? "out" : "in")} variant={isClockedIn ? "destructive" : "default"} className={`${!isClockedIn ? 'bg-emerald-600 hover:bg-emerald-700' : ''} w-full h-12 font-black rounded-xl uppercase text-xs tracking-widest shadow-lg`}>
                  {isClockedIn ? <LogOut className="w-4 h-4 mr-2" /> : <LogIn className="w-4 h-4 mr-2" />} {isClockedIn ? "Salida" : "Entrada"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b bg-gray-50 font-black text-xs uppercase tracking-widest text-gray-500">Registros</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-400 font-bold text-[10px] uppercase">
              <tr>
                <th className="px-6 py-4">Empleado</th>
                <th className="px-6 py-4 text-center">Fecha</th>
                <th className="px-6 py-4 text-center">Entrada</th>
                <th className="px-6 py-4 text-center">Salida</th>
                <th className="px-6 py-4 text-center">Duración</th>
                {isOwner && <th className="px-6 py-4 text-right">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => {
                const time = calculateTime(log.clock_in, log.clock_out);
                return (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900">{log.employees?.name}</td>
                    <td className="px-6 py-4 text-gray-500 text-center font-medium">{format(parseISO(log.date), "dd/MM/yyyy")}</td>
                    <td className="px-6 py-4 text-emerald-600 font-bold text-center">{format(new Date(log.clock_in), "HH:mm")}</td>
                    <td className="px-6 py-4 text-rose-600 font-bold text-center">{log.clock_out ? format(new Date(log.clock_out), "HH:mm") : <span className="text-amber-500 text-[10px] uppercase font-black">En curso</span>}</td>
                    <td className="px-6 py-4 text-center"><span className="bg-gray-100 px-2 py-1 rounded-lg font-black text-[10px] text-gray-600 flex items-center justify-center gap-1 w-fit mx-auto"><Timer className="w-3 h-3" /> {time.text}</span></td>
                    {isOwner && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(log)} className="text-indigo-400 hover:bg-indigo-50"><Edit className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteLog(log.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-white rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-black text-xl uppercase tracking-tighter">
              {editingId ? (isInProgress ? "Ajustar Entrada (En curso)" : "Editar Jornada") : "Crear Jornada Manual"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-gray-400">Empleado</label>
              <select className="w-full border rounded-xl p-2.5 text-sm bg-gray-50 outline-none" value={formData.employee_id} onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}>
                <option value="">Elegir...</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-gray-400">Fecha</label>
              <Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400">Hora Entrada</label>
                <Input type="time" value={formData.clock_in} onChange={(e) => setFormData({ ...formData, clock_in: e.target.value })} className="rounded-xl" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-gray-400">Hora Salida</label>
                <Input 
                  type="time" 
                  value={formData.clock_out} 
                  onChange={(e) => setFormData({ ...formData, clock_out: e.target.value })} 
                  className="rounded-xl"
                  placeholder="HH:mm"
                />
                {isInProgress && !formData.clock_out && (
                  <p className="text-[8px] text-amber-600 font-bold mt-1">
                    * Vacío para mantener en curso, o ingresa hora para finalizar.
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSubmit} className="w-full bg-indigo-600 text-white font-black py-6 rounded-2xl shadow-lg uppercase text-xs tracking-widest">
              {editingId ? "Actualizar" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JornadasPage;