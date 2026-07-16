import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Sparkles, Upload, ScanSearch, FolderTree, Pencil, Trash2,
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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { skillsStore, useStore, uid, recordHistory, type Skill } from "@/lib/mock-store";
import { validateSkill } from "@/lib/validators";
import { EmptyState, FieldHint } from "@/components/empty-state";
import { ConnectorBindingEditor, ConnectorBindingBadge } from "@/components/connector-binding-editor";


type SkillsSearch = { q?: string; filter?: string; sort?: string; order?: "asc" | "desc" };
const FILTERS = ["全部", "已启用", "内置", "自建", "导入"] as const;
const SKILL_SORTS = [
  { value: "name", label: "名称" },
  { value: "files", label: "文件数" },
  { value: "source", label: "来源" },
];

export const Route = createFileRoute("/skills")({
  validateSearch: (s: Record<string, unknown>): SkillsSearch => ({
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    filter: typeof s.filter === "string" ? s.filter : undefined,
    sort: typeof s.sort === "string" ? s.sort : undefined,
    order: s.order === "desc" ? "desc" : s.order === "asc" ? "asc" : undefined,
  }),
  component: SkillsPage,
});

function SkillsPage() {
  const skills = useStore(skillsStore);
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
  const [editing, setEditing] = useState<Skill | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Skill | null>(null);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let arr = skills.filter((s) => {
      if (kw && !`${s.name} ${s.slug} ${s.desc}`.toLowerCase().includes(kw)) return false;
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
    setEditing({ id: "", name: "", slug: "", desc: "", files: 1, enabled: true, source: "自建" });
    setOpen(true);
  }
  function openEdit(s: Skill) { setEditing(s); setOpen(true); }
  function save(s: Skill) {
    const r = validateSkill(s, skills);
    if (!r.ok) {
      toast.error(`保存失败：${r.firstMessage}`, { description: r.suggestion });
      return { ok: false as const, errors: r.errors };
    }
    if (s.id) {
      skillsStore.replace((x) => x.id === s.id, s);
      recordHistory("skills", `编辑 Skill「${s.name}」`);
      toast.success("Skill 已更新");
    } else {
      skillsStore.add({ ...s, id: uid() });
      recordHistory("skills", `新增 Skill「${s.name}」`);
      toast.success("Skill 已新增");
    }
    setOpen(false);
    return { ok: true as const, errors: {} };
  }
  function toggle(s: Skill, enabled: boolean) {
    skillsStore.update((x) => x.id === s.id, { enabled });
    recordHistory("skills", `${enabled ? "启用" : "停用"} Skill「${s.name}」`);
  }
  function remove(s: Skill) {
    skillsStore.remove((x) => x.id === s.id);
    recordHistory("skills", `删除 Skill「${s.name}」`);
    toast.success("已删除");
    setToDelete(null);
  }
  function scan() {
    const found: Skill = {
      id: uid(), name: `扫描技能 ${skills.length + 1}`, slug: `scanned-${uid()}`,
      desc: "从 workspace 自动扫描发现的示例技能。", files: Math.floor(Math.random() * 5) + 1,
      enabled: false, source: "扫描发现",
    };
    skillsStore.add(found);
    recordHistory("skills", `扫描发现「${found.name}」`);
    toast.success(`扫描发现 1 个新技能：${found.name}`);
  }
  const zipInputRef = useRef<HTMLInputElement>(null);
  function openZipPicker() { zipInputRef.current?.click(); }
  async function handleZipFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
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
      const slugBase = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "imported";
      const kb = (file.size / 1024).toFixed(1);
      const found: Skill = {
        id: uid(),
        name: base || `导入技能 ${skills.length + ok + 1}`,
        slug: `${slugBase}-${uid().slice(0, 4)}`,
        desc: `从 ZIP 包「${file.name}」（${kb} KB）导入。`,
        files: Math.max(1, Math.round(file.size / 8192)),
        enabled: true,
        source: "ZIP 导入",
      };
      skillsStore.add(found);
      recordHistory("skills", `ZIP 导入「${found.name}」`);
      ok++;
    }
    if (ok > 0) toast.success(`已导入 ${ok} 个技能包`);
    if (zipInputRef.current) zipInputRef.current.value = "";
  }


  return (
    <div className="mx-auto max-w-6xl px-6 py-5">
      <PageHeader
        title="Skills"
        subtitle="用可复用的技能包扩展执行能力。支持新增、修改、ZIP 导入或从 workspace 扫描发现。"
        action={
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={scan}>
              <ScanSearch className="h-4 w-4" /> 扫描发现
            </Button>
            <Button variant="outline" className="gap-2" onClick={openZipPicker}>
              <Upload className="h-4 w-4" /> ZIP 导入
            </Button>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              multiple
              className="hidden"
              onChange={(e) => handleZipFiles(e.target.files)}
            />
            <Button className="gap-2 bg-brand text-brand-foreground hover:opacity-90" onClick={openNew}>
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
        <div className="mt-2 text-[11px] text-muted-foreground">{filtered.length} / {skills.length}</div>
      </div>


      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {filtered.map((s) => (
          <div key={s.id} className="card-warm p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-[15px] font-semibold text-foreground">{s.name}</h3>
                  <Badge variant="outline" className="border-border text-[10px] font-normal text-muted-foreground">
                    {s.source}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  skills/{s.slug}/SKILL.md
                </p>
              </div>
              <Switch checked={s.enabled} onCheckedChange={(v) => toggle(s, v)} />
            </div>
            <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{s.desc}</p>
            {s.connectorBinding && (
              <div className="mt-2"><ConnectorBindingBadge binding={s.connectorBinding} /></div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <FolderTree className="h-3 w-3" /> {s.files} 个文件
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-[12px]" onClick={() => openEdit(s)}>
                  <Pencil className="h-3 w-3" /> 编辑
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setToDelete(s)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
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
                    <Button size="sm" onClick={openNew} className="gap-1.5 bg-brand text-brand-foreground hover:opacity-90">
                      <Plus className="h-3.5 w-3.5" /> 新增
                    </Button>
                  </div>
                }
              />
            ) : (
              <EmptyState compact title="没有符合条件的技能" description="调整搜索关键词或筛选条件后重试。" />
            )}
          </div>
        )}
      </div>

      <SkillDialog open={open} onOpenChange={setOpen} value={editing} onSave={save} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除技能</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除 <b>{toDelete?.name}</b> 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && remove(toDelete)}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SkillDialog({
  open, onOpenChange, value, onSave,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  value: Skill | null;
  onSave: (s: Skill) => { ok: boolean; errors: Record<string, string> };
}) {
  const [form, setForm] = useState<Skill | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (open && value && form?.id !== value.id) { setForm(value); setErrors({}); }
  if (!open && form) setForm(null);
  if (!form) return null;

  function handleSave() {
    if (!form) return;
    const r = onSave(form);
    if (!r.ok) setErrors(r.errors);
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
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="PRD 生成器" aria-invalid={!!errors.name} />
              {errors.name ? <p className="text-[11px] text-destructive">{errors.name}</p> : <FieldHint>在选择器与列表中显示。</FieldHint>}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Slug</Label>
              <Input className="font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="prd-generator" aria-invalid={!!errors.slug} />
              {errors.slug ? <p className="text-[11px] text-destructive">{errors.slug}</p> : <FieldHint>目录名，仅允许小写字母、数字与短横线。</FieldHint>}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">描述</Label>
            <Textarea rows={3} value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} aria-invalid={!!errors.desc} />
            {errors.desc ? <p className="text-[11px] text-destructive">{errors.desc}</p> : <FieldHint>说明该技能包适用场景与使用前提。</FieldHint>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">文件数</Label>
              <Input type="number" min={1} value={form.files} onChange={(e) => setForm({ ...form, files: Number(e.target.value) || 1 })} aria-invalid={!!errors.files} />
              {errors.files ? <p className="text-[11px] text-destructive">{errors.files}</p> : <FieldHint>包含 SKILL.md 在内的资源文件数量。</FieldHint>}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">来源</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v as Skill["source"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="内置">内置</SelectItem>
                  <SelectItem value="自建">自建</SelectItem>
                  <SelectItem value="ZIP 导入">ZIP 导入</SelectItem>
                  <SelectItem value="扫描发现">扫描发现</SelectItem>
                </SelectContent>
              </Select>
              <FieldHint>用于分类与筛选。</FieldHint>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
            <Label className="text-xs">默认启用</Label>
          </div>
          <ConnectorBindingEditor
            value={form.connectorBinding}
            onChange={(v) => setForm({ ...form, connectorBinding: v })}
          />

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="bg-brand text-brand-foreground hover:opacity-90" onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
