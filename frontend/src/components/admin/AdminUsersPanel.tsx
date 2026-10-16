"use client";

import { useEffect, useState } from "react";
import { Ban, Loader2, RefreshCw, Search, ShieldCheck, Undo2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { formatDate } from "@/lib/format";
import { banUser, listAdminUsers, setUserRole, unbanUser, type AdminUser } from "@/lib/admin";
import { cn } from "@/lib/utils";

/**
 * Gestão de utilizadores (painel admin): pesquisa, promover/rebaixar e
 * bloquear contas. Cada mutação atualiza a lista local com o DTO devolvido
 * pelo servidor (a fonte da verdade) — sem reload.
 */
export function AdminUsersPanel({ selfId }: { selfId?: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await listAdminUsers(q);
      setUsers(page.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar utilizadores");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // queueMicrotask: o setState do loading não pode disparar dentro do efeito
    // (regra react-hooks/set-state-in-effect).
    queueMicrotask(() => void load());
  }, []);

  const act = async (id: string, action: (id: string) => Promise<AdminUser>) => {
    setBusyId(id);
    setError(null);
    try {
      const updated = await action(id);
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou");
    } finally {
      setBusyId(null);
    }
  };

  const toggleRole = (u: AdminUser) => {
    const target = u.role === "ADMIN" ? "CUSTOMER" : "ADMIN";
    if (u.id === selfId) {
      window.alert("Não pode alterar a sua própria role — peça a outro administrador.");
      return;
    }
    if (window.confirm(`Mudar a role de ${u.email} para ${target}?`)) {
      void act(u.id, (id) => setUserRole(id, target));
    }
  };

  const toggleBan = (u: AdminUser) => {
    if (u.id === selfId) {
      window.alert("Não pode bloquear a sua própria conta.");
      return;
    }
    if (u.banned) {
      if (window.confirm(`Desbloquear ${u.email}?`)) void act(u.id, (id) => unbanUser(id));
      return;
    }
    const reason = window.prompt(`Motivo do bloqueio de ${u.email} (opcional):`);
    if (reason !== null) void act(u.id, (id) => banUser(id, reason));
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load(query);
            }}
            placeholder="Pesquisar por email ou nome…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(query)} disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Procurar
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          {error}
        </div>
      )}

      {loading && users.length === 0 && (
        <div className="flex justify-center py-10">
          <Loader2 className="size-7 animate-spin text-primary-600" />
        </div>
      )}

      {!loading && users.length === 0 && !error && (
        <EmptyState
          icon={UserCog}
          title="Nenhum utilizador encontrado"
          description="Ajuste a pesquisa ou recarregue a lista."
        />
      )}

      <div className="space-y-3">
        {users.map((u) => (
          <div
            key={u.id}
            className={cn(
              "rounded-2xl border bg-surface p-4 transition",
              u.banned ? "border-red-200" : "border-slate-100",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display font-bold text-slate-900">{u.fullName}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-bold",
                      u.role === "ADMIN"
                        ? "bg-navy-900 text-white"
                        : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {u.role}
                  </span>
                  {u.banned && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">
                      Bloqueado
                    </span>
                  )}
                  {!u.emailVerified && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                      Email por verificar
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-sm text-slate-500">{u.email}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {u.authProvider}
                  {u.phone ? ` · ${u.phone}` : ""}
                  {u.createdAt ? ` · desde ${formatDate(u.createdAt)}` : ""}
                  {u.banned && u.bannedReason ? ` · motivo: ${u.bannedReason}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => toggleRole(u)} disabled={busyId === u.id}>
                  <ShieldCheck className="size-3.5" /> {u.role === "ADMIN" ? "Rebaixar" : "Promover"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={u.banned ? "border-emerald-300 text-emerald-700" : "border-red-200 text-red-600"}
                  onClick={() => toggleBan(u)}
                  disabled={busyId === u.id}
                >
                  {u.banned ? (
                    <>
                      <Undo2 className="size-3.5" /> Desbloquear
                    </>
                  ) : (
                    <>
                      <Ban className="size-3.5" /> Bloquear
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
