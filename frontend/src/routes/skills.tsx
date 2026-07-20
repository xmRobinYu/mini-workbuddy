import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Sparkles,
  Upload,
  ScanSearch,
  FolderTree,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/page-header";
import { ListToolbar } from "@/components/list-toolbar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { skillsApi, type SkillViewModel, type SkillForm, type SkillSource } from "@/lib/api";
import { EmptyState, FieldHint } from "@/components/empty-state";

type SkillsSearch = { q?: string; filter?: string; sort?: string; order?: "asc" | "desc" };
const FILTERS = ["全部", "已启用", "内置", "自建", "导入"] as const;
const SKILL_SORTS = [
  { value: "name", label: "名称" },
  { value: "files", label: "文件数" },
  { value: "source", label: "来源" },
];

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

export const Route = createFileRoute("/skills")({
  validateSearch: (s: Record<string, unknown>): SkillsSearch => ({
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    filter: typeof s.filter === "string" ? s.filter : undefined,
    sort: typeof s.sort === "string" ? s.sort : undefined,
    order: s.order === "desc" ? "desc" : s.order === "asc" ? "asc" : undefined,
  }),
  component: SkillsPage,
});

const EMPTY_FORM: SkillForm = {
  id: null,
  name: "",
  slug: "",
  description: "",
  enabled: true,
  content: "",
};

function validateForm(
  form: SkillForm,
  skills: SkillViewModel[],
): { ok: true } | { ok: false; message: string } {
  if (!form.name.trim()) return { ok: false, message: "名称不能为空" };
  if (!SLUG_RE.test(form.slug.trim())) {
    return { ok: false, message: "slug 仅允许小写字母、数字与短横线，且以字母或数字开头" };
  }
  if (skills.some((s) => s.id !== form.id && s.slug === form.slug.trim())) {
    return { ok: false, message: "slug 已被占用" };
  }
  return { ok: true };
}

function SkillsPage() {
  const [skills, setSkills] = useState<SkillViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const q = search.q ?? "";
  const filter = search.filter ?? "全部";
  const sort = search.sort ?? "name";
  const order = search.order ?? "asc";
  const hasQuery = !!(search.q || search.filter || search.sort || search.order);
  const patch = (p: Partial<SkillsSearch>) =>
    navigate({
      search: (prev: SkillsSearch) => {
        const next = { ...prev, ...p };
        (Object.keys(next) as (keyof SkillsSearch)[]).forEach((k) => {
          if (next[k] === "" || next[k] == null) delete next[k];
        });
        return next;
      },
    });
  const [editing, setEditing] = useState<SkillForm | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<SkillViewModel | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setSkills(await skillsApi.list());
    } catch (error) {
      toast.error("加载 Skills 失败", { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let arr = skills.filter((s) => {
      if (kw && !`${s.name} ${s.slug} ${s.description}`.toLowerCase().includes(kw)) return false;
      if (filter === "已启用") return s.enabled;
      if (filter === "内置") return s.source === "内置";
      if (filter === "自建") return s.source === "自建";
      if (filter === "导入") return s.source === "ZIP 导入" || s.source === "扫描发现";
      return true;
    });
    arr = [...arr].sort((a, b) => {
      let c = 0;
      if (sort === "files") c = a.files - b.files;
      else if (sort === "source") c = a.source.localeCompare(b.source, "zh");
      else c = a.name.localeCompare(b.name, "zh");
      return order === "asc" ? c : -c;
    });
    return arr;
  }, [skills, q, filter, sort, order]);

  function openNew() {
    setEditing({ ...EMPTY_FORM });
    setOpen(true);
  }
  async function openEdit(s: SkillViewModel) {
    // SKILL.md content is read from disk by the loop; the editor treats the
    // description as the editable summary (slug is immutable after creation).
    setEditing({
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
      enabled: s.enabled,
      content: "",
    });
    setOpen(true);
  }
  async function save(form: SkillForm) {
    const r = validateForm(form, skills);
    if (!r.ok) {
      toast.error(`保存失败：${r.message}`);
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        const updated = await skillsApi.update(form.id, form);
        setSkills((cur) => cur.map((s) => (s.id === updated.id ? updated : s)));
        toast.success("Skill 已更新");
      } else {
        const created = await skillsApi.create(form);
        setSkills((cur) => [...cur, created]);
        toast.success("Skill 已新增");
      }
      setOpen(false);
    } catch (error) {
      toast.error("保存 Skill 失败", { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }
  async function toggle(s: SkillViewModel, enabled: boolean) {
    // Optimistic update; rollback on failure.
    setSkills((cur) => cur.map((x) => (x.id === s.id ? { ...x, enabled } : x)));
    try {
      const updated = await skillsApi.update(s.id, {
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        enabled,
        content: "",
      });
      setSkills((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
    } catch (error) {
      setSkills((cur) => cur.map((x) => (x.id === s.id ? { ...x, enabled: !enabled } : x)));
      toast.error("更新 Skill 失败", { description: errorMessage(error) });
    }
  }
  async function remove(s: SkillViewModel) {
    try {
      await skillsApi.remove(s.id);
      setSkills((cur) => cur.filter((x) => x.id !== s.id));
      toast.success("已删除");
    } catch (error) {
      toast.error("删除 Skill 失败", { description: errorMessage(error) });
    } finally {
      setToDelete(null);
    }
  }
  async function scan() {
    setBusy(true);
    try {
      const result = await skillsApi.scan();
      if (result.discovered.length === 0) {
        toast.info("没有发现新的技能目录");
      } else {
        toast.success(`扫描发现 ${result.discovered.length} 个新技能`);
      }
      await load();
    } catch (error) {
      toast.error("扫描失败", { description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }
  const zipInputRef = useRef<HTMLInputElement>(null);
  function openZipPicker() {
    zipInputRef.current?.click();
  }
  async function handleZipFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setBusy(true);
    let ok = 0;
    for (const file of files) {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".zip")) {
        toast.error(`跳过：${file.name} 不是 .zip 文件`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`跳过：${file.name} 超过 20MB 上限`);
        continue;
      }
      const base = file.name.replace(/\.zip$/i, "");
      const slugBase =
        base
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "imported";
      // De-duplicate slug against current list + this batch's imports.
      const existing = new Set(skills.map((s) => s.slug));
      let slug = slugBase;
      let n = 1;
      while (existing.has(slug)) {
        slug = `${slugBase}-${n++}`;
      }
      existing.add(slug);
      try {
        await skillsApi.importZip(file, {
          id: null,
          name: base || `导入技能 ${ok + 1}`,
          slug,
          description: `从 ZIP 包「${file.name}」导入。`,
          enabled: true,
        });
        ok++;
      } catch (error) {
        toast.error(`导入「${file.name}」失败`, { description: errorMessage(error) });
      }
    }
    if (ok > 0) {
      toast.success(`已导入 ${ok} 个技能包`);
      await load();
    }
    setBusy(false);
    if (zipInputRef.current) zipInputRef.current.value = "";
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-5">
      <PageHeader
        title="Skills"
        subtitle="用可复用的技能包扩展执行能力。支持新增、修改、ZIP 导入或从 workspace 扫描发现。"
        action={
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" disabled={busy} onClick={() => void scan()}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanSearch className="h-4 w-4" />
              )}{" "}
              扫描发现
            </Button>
            <Button variant="outline" className="gap-2" disabled={busy} onClick={openZipPicker}>
              <Upload className="h-4 w-4" /> ZIP 导入
            </Button>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              multiple
              className="hidden"
              onChange={(e) => void handleZipFiles(e.target.files)}
            />
            <Button
              className="gap-2 bg-brand text-brand-foreground hover:opacity-90"
              onClick={openNew}
            >
              <Plus className="h-4 w-4" /> 新增
            </Button>
          </div>
        }
      />

      <div className="mt-5">
        <ListToolbar
          q={q}
          onQChange={(v) => patch({ q: v || undefined })}
          filters={FILTERS}
          activeFilter={filter}
          onFilterChange={(v) => patch({ filter: v === "全部" ? undefined : v })}
          sortOptions={SKILL_SORTS}
          sort={sort}
          order={order}
          onSortChange={(v) => patch({ sort: v === "name" ? undefined : v })}
          onOrderChange={(v) => patch({ order: v === "asc" ? undefined : v })}
          placeholder="搜索技能..."
          canReset={hasQuery}
          onReset={() => navigate({ search: {} as SkillsSearch })}
        />
        <div className="mt-2 text-[11px] text-muted-foreground">
          {filtered.length} / {skills.length}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {loading ? (
          <div className="col-span-full flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
          </div>
        ) : (
          filtered.map((s) => (
            <div key={s.id} className="card-warm p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[15px] font-semibold text-foreground">{s.name}</h3>
                    <Badge
                      variant="outline"
                      className="border-border text-[10px] font-normal text-muted-foreground"
                    >
                      {s.source}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    skills/{s.slug}/SKILL.md
                  </p>
                </div>
                <Switch checked={s.enabled} onCheckedChange={(v) => void toggle(s, v)} />
              </div>
              <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                {s.description || "未填写描述"}
              </p>

              <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <FolderTree className="h-3 w-3" /> {s.files} 个文件
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-[12px]"
                    onClick={() => void openEdit(s)}
                  >
                    <Pencil className="h-3 w-3" /> 编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setToDelete(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
        {!loading && filtered.length === 0 && (
          <div className="col-span-full">
            {skills.length === 0 ? (
              <EmptyState
                icon={FolderTree}
                title="尚未添加技能包"
                description="技能包由 SKILL.md 与相关资源组成，可通过新增、ZIP 导入或扫描 workspace 目录快速引入。"
                action={
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={openZipPicker} className="gap-1.5">
                      <Upload className="h-3.5 w-3.5" /> ZIP 导入
                    </Button>
                    <Button
                      size="sm"
                      onClick={openNew}
                      className="gap-1.5 bg-brand text-brand-foreground hover:opacity-90"
                    >
                      <Plus className="h-3.5 w-3.5" /> 新增
                    </Button>
                  </div>
                }
              />
            ) : (
              <EmptyState
                compact
                title="没有符合条件的技能"
                description="调整搜索关键词或筛选条件后重试。"
              />
            )}
          </div>
        )}
      </div>

      <SkillDialog
        open={open}
        onOpenChange={setOpen}
        value={editing}
        saving={saving}
        onSave={(f) => void save(f)}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除技能</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除 <b>{toDelete?.name}</b> 吗？此操作不可撤销，会同时移除技能目录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && void remove(toDelete)}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SkillDialog({
  open,
  onOpenChange,
  value,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: SkillForm | null;
  saving: boolean;
  onSave: (f: SkillForm) => void;
}) {
  const [form, setForm] = useState<SkillForm | null>(null);
  if (open && value && form?.slug !== value.slug) {
    setForm(value);
  }
  if (!open && form) setForm(null);
  if (!form) return null;

  function handleSave() {
    if (!form) return;
    onSave(form);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "编辑 Skill" : "新增 Skill"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="PRD 生成器"
              />
              <FieldHint>在选择器与列表中显示。</FieldHint>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Slug</Label>
              <Input
                className="font-mono"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="prd-generator"
                disabled={!!form.id}
              />
              <FieldHint>
                {form.id ? "创建后不可修改。" : "目录名，仅允许小写字母、数字与短横线。"}
              </FieldHint>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">描述</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <FieldHint>说明该技能包适用场景与使用前提。</FieldHint>
          </div>
          {!form.id && (
            <div className="grid gap-1.5">
              <Label className="text-xs">SKILL.md 内容（可选）</Label>
              <Textarea
                rows={4}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="# 技能名&#10;在此描述执行步骤与输入输出约定。"
              />
              <FieldHint>留空将写入以名称为标题的占位骨架。</FieldHint>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm({ ...form, enabled: v })}
            />
            <Label className="text-xs">启用（仅启用的技能会进入 Agent 勾选项）</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            className="bg-brand text-brand-foreground hover:opacity-90"
            disabled={saving}
            onClick={handleSave}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
