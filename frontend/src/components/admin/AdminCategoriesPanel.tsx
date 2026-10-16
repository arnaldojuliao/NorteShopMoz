"use client";

import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, RefreshCw, Tag, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Input";
import {
  createCategory,
  deleteCategory,
  listAdminCategories,
  updateCategory,
  type AdminCategory,
} from "@/lib/admin";
import { cn } from "@/lib/utils";

/**
 * CRUD de categorias (painel admin). O slug não é editável (chave primária
 * referenciada pelos produtos); apagar só passa com a categoria vazia — o
 * erro do servidor é mostrado tal e qual.
 */
export function AdminCategoriesPanel() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [image, setImage] = useState("");
  const [description, setDescription] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setCategories(await listAdminCategories());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar categorias");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // queueMicrotask: o setState do loading não pode disparar dentro do efeito
    // (regra react-hooks/set-state-in-effect).
    queueMicrotask(() => void load());
  }, []);

  const resetForm = () => {
    setEditing(null);
    setCreating(false);
    setName("");
    setEmoji("");
    setImage("");
    setDescription("");
  };

  const openEdit = (c: AdminCategory) => {
    setCreating(false);
    setEditing(c);
    setName(c.name);
    setEmoji(c.emoji ?? "");
    setImage(c.image ?? "");
    setDescription(c.description ?? "");
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        const updated = await updateCategory(editing.slug, { name, emoji, image, description });
        setCategories((prev) => prev.map((c) => (c.slug === updated.slug ? updated : c)));
      } else {
        const created = await createCategory({ name, emoji, image, description });
        setCategories((prev) => [...prev, created].sort((a, b) => a.slug.localeCompare(b.slug)));
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: AdminCategory) => {
    if (!window.confirm(`Apagar a categoria "${c.name}" (${c.slug})?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteCategory(c.slug);
      setCategories((prev) => prev.filter((x) => x.slug !== c.slug));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operação falhou");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {categories.length} categoria{categories.length === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Atualizar
          </Button>
          {!creating && !editing && (
            <Button size="sm" onClick={() => { setCreating(true); resetForm(); setCreating(true); }}>
              <Plus className="size-3.5" /> Nova categoria
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          {error}
        </div>
      )}

      {(creating || editing) && (
        <div className="rounded-2xl border border-primary-100 bg-primary-50/40 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-slate-900">
              {editing ? `Editar “${editing.slug}”` : "Nova categoria"}
            </h3>
            <Button variant="ghost" size="sm" onClick={resetForm}>
              <X className="size-3.5" /> Fechar
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="font-semibold text-slate-700">Nome *</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Telefones" className="mt-1" />
            </label>
            <label className="text-sm">
              <span className="font-semibold text-slate-700">Emoji</span>
              <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="📱" maxLength={8} className="mt-1" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="font-semibold text-slate-700">URL da imagem</span>
              <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" className="mt-1" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="font-semibold text-slate-700">Descrição</span>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Uma linha sobre a categoria…"
                className="mt-1"
              />
            </label>
          </div>
          <Button className="mt-4" onClick={() => void save()} loading={busy} disabled={!name.trim()}>
            {editing ? "Guardar alterações" : "Criar categoria"}
          </Button>
        </div>
      )}

      {loading && categories.length === 0 && (
        <div className="flex justify-center py-10">
          <Loader2 className="size-7 animate-spin text-primary-600" />
        </div>
      )}

      {!loading && categories.length === 0 && !error && (
        <EmptyState
          icon={Tag}
          title="Sem categorias"
          description="Crie a primeira categoria para organizar o catálogo."
        />
      )}

      <div className="space-y-2">
        {categories.map((c) => (
          <div
            key={c.slug}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-surface p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-xl">{c.emoji ?? "🏷️"}</span>
              <div className="min-w-0">
                <p className="font-display font-bold text-slate-900">{c.name}</p>
                <p className="truncate text-xs text-slate-400">
                  {c.slug}
                  {c.description ? ` · ${c.description}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                <Pencil className="size-3.5" /> Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600"
                onClick={() => void remove(c)}
                disabled={busy}
              >
                <Trash2 className="size-3.5" /> Apagar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
