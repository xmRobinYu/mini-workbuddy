import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bot, Plus, Wrench, Sparkles, Lock, Pencil, Trash2, Copy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  agentsStore, modelsStore, toolsStore, skillsStore,
  useStore, uid, recordHistory, type Agent,
} from "@/lib/mock-store";

import { validateAgent } from "@/lib/validators";


type AgentsSearch = { q?: string; filter?: string; sort?: string; order?: "asc" | "desc" };
const FILTERS = ["全部", "系统", "自定义"] as const;
const AGENT_SORTS = [
  { value: "name", label: "名称" },
  { value: "tools", label: "工具数" },
  { value: "skills", label: "Skills 数" },
];

export const Route = createFileRoute("/agents")({
  validateSearch: (s: Record<string, unknown>): AgentsSearch => ({
    q: typeof s.q === "string" && s.q ? s.q : undefined,
    filter: typeof s.filter === "string" ? s.filter : undefined,
    sort: typeof s.sort === "string" ? s.sort : undefined,
    order: s.order === "desc" ? "desc" : s.order === "asc" ? "asc" : undefined,
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const agents = useStore(agentsStore);
  const models = useStore(modelsStore);
  const tools = useStore(toolsStore);
  const skills = useStore(skillsStore);
  
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const q = search.q ?? "";
  const filter = search.filter ?? "全部";
  const sort = search.sort ?? "name";
  const order = search.order ?? "asc";
  const hasQuery = !!(search.q || search.filter || search.sort || search.order);
  const patch = (p: Partial<AgentsSearch>) =>
    navigate({
      search: (prev: AgentsSearch) => {
        const next = { ...prev, ...p };
        (Object.keys(next) as (keyof AgentsSearch)[]).forEach((k) => {
          if (next[k] === "" || next[k] == null) delete next[k];
        });
        return next;
      },
    });
  const [editing, setEditing] = useState<Agent | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Agent | null>(null);




  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    let arr = agents.filter((a) => {
      if (kw && !`${a.name} ${a.slug} ${a.desc} ${a.tags.join(" ")}`.toLowerCase().includes(kw)) return false;
      if (filter === "系统") return !!a.system;
      if (filter === "自定义") return !a.system;
      return true;
    });
    arr = [...arr].sort((a, b) => {
      let c = 0;
      if (sort === "tools") c = a.toolKeys.length - b.toolKeys.length;
      else if (sort === "skills") c = a.skillIds.length - b.skillIds.length;
      else c = a.name.localeCompare(b.name, "zh");
      return order === "asc" ? c : -c;
    });
    return arr;
  }, [agents, q, filter, sort, order]);


  const systemCount = agents.filter((a) => a.system).length;

  function openNew() {
    setEditing({
      id: "", name: "", slug: "", desc: "", systemPrompt: "",
      modelId: models[0]?.id ?? "", toolKeys: [], skillIds: [], tags: [],
    });
    setOpen(true);
  }
  function openEdit(a: Agent) { setEditing(a); setOpen(true); }
  function duplicate(a: Agent) {
    const copy: Agent = { ...a, id: uid(), name: `${a.name} 副本`, slug: `${a.slug}-copy`, system: false };
    agentsStore.add(copy);
    recordHistory("agents", `复制 Agent「${copy.name}」`);
    toast.success(`已复制：${copy.name}`);
  }
  function save(a: Agent) {
    const r = validateAgent(a, agents, models.map((m) => m.id));
    if (!r.ok) {
      toast.error(`保存失败：${r.firstMessage}`, { description: r.suggestion });
      return { ok: false as const, errors: r.errors };
    }
    if (a.id) {
      agentsStore.replace((x) => x.id === a.id, a);
      recordHistory("agents", `编辑 Agent「${a.name}」`);
      toast.success("Agent 已更新");
    } else {
      agentsStore.add({ ...a, id: uid() });
      recordHistory("agents", `新增 Agent「${a.name}」`);
      toast.success("Agent 已新增");
    }
    setOpen(false);
    return { ok: true as const, errors: {} };
  }
  function remove(a: Agent) {
    if (a.system) {
      toast.error("系统 Agent 无法删除");
      setToDelete(null);
      return;
    }
    agentsStore.remove((x) => x.id === a.id);
    recordHistory("agents", `删除 Agent「${a.name}」`);
    toast.success("已删除");
    setToDelete(null);
  }


  return (
    <div className="mx-auto max-w-6xl px-6 py-5">
      <PageHeader
        title="Agent"
        subtitle="为不同场景创建独立的执行单元，配置系统提示词、可用工具与技能。"
        action={
          <Button onClick={openNew} className="gap-2 bg-brand text-brand-foreground hover:opacity-90">
            <Plus className="h-4 w-4" /> 新建 Agent
          </Button>
        }
      />

      <div className="mt-5">
        <ListToolbar
          q={q}
          onQChange={(v) => patch({ q: v || undefined })}
          filters={FILTERS}
          activeFilter={filter}
          onFilterChange={(v) => patch({ filter: v === "全部" ? undefined : v })}
          sortOptions={AGENT_SORTS}
          sort={sort}
          order={order}
          onSortChange={(v) => patch({ sort: v === "name" ? undefined : v })}
          onOrderChange={(v) => patch({ order: v === "asc" ? undefined : v })}
          placeholder="搜索 Agent / 标签..."
          canReset={hasQuery}
          onReset={() => navigate({ search: {} as AgentsSearch })}
        />
        <div className="mt-2 text-[11px] text-muted-foreground">
          {filtered.length} / {agents.length} · {systemCount} 个系统
        </div>
      </div>


      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((a) => {
          const model = models.find((m) => m.id === a.modelId);
          return (
            <div key={a.id} className="card-warm group relative flex flex-col p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand ring-1 ring-brand/15">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-display text-base font-semibold text-foreground truncate">{a.name}</h3>
                    {a.system && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">@{a.slug}</p>
                </div>
              </div>

              <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{a.desc}</p>

              <div className="mt-3 flex flex-wrap gap-1">
                {a.tags.map((t) => (
                  <Badge key={t} variant="outline" className="border-brand/20 bg-brand-soft/40 text-[10px] font-normal text-foreground/80">
                    {t}
                  </Badge>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Wrench className="h-3 w-3" /> {a.toolKeys.length} 工具
                </span>
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> {a.skillIds.length} Skills
                </span>
                <span className="truncate font-mono text-[10px]">{model?.name ?? "未指定"}</span>
              </div>

              <div className="mt-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button variant="ghost" size="sm" className="h-7 flex-1 gap-1 text-[12px]" onClick={() => openEdit(a)}>
                  <Pencil className="h-3 w-3" /> 编辑
                </Button>
                <Button variant="ghost" size="sm" className="h-7 gap-1 text-[12px]" onClick={() => duplicate(a)}>
                  <Copy className="h-3 w-3" /> 复制
                </Button>
                {!a.system && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setToDelete(a)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        <button
          onClick={openNew}
          className="card-warm flex min-h-[190px] flex-col items-center justify-center gap-2 border-dashed text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-current">
            <Plus className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium">新建 Agent</span>
          <span className="text-[11px]">配置模型、工具与技能包</span>
        </button>
      </div>




      <AgentDialog
        open={open} onOpenChange={setOpen}
        value={editing} onSave={save}
        models={models} tools={tools} skills={skills}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Agent</AlertDialogTitle>
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

function AgentDialog({
  open, onOpenChange, value, onSave, models, tools, skills,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: Agent | null;
  onSave: (a: Agent) => { ok: boolean; errors: Record<string, string> };
  models: ReturnType<typeof useStore<any>> extends infer T ? any : any;
  tools: any;
  skills: any;
}) {
  const [form, setForm] = useState<Agent | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (open && value && form?.id !== value.id) {
    setForm(value);
    setTagInput(value.tags.join(", "));
    setErrors({});
  }
  if (!open && form) setForm(null);
  if (!form) return null;

  function toggleTool(k: string) {
    setForm((f) => f && ({
      ...f,
      toolKeys: f.toolKeys.includes(k) ? f.toolKeys.filter((x) => x !== k) : [...f.toolKeys, k],
    }));
  }
  function toggleSkill(id: string) {
    setForm((f) => f && ({
      ...f,
      skillIds: f.skillIds.includes(id) ? f.skillIds.filter((x) => x !== id) : [...f.skillIds, id],
    }));
  }
  function handleSave() {
    if (!form) return;
    const tags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);
    const r = onSave({ ...form, tags });
    if (!r.ok) setErrors(r.errors);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "编辑 Agent" : "新建 Agent"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} />
              {errors.name && <p className="text-[11px] text-destructive">{errors.name}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Slug</Label>
              <Input className="font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="doc" aria-invalid={!!errors.slug} />
              {errors.slug && <p className="text-[11px] text-destructive">{errors.slug}</p>}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">简介</Label>
            <Input value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} aria-invalid={!!errors.desc} />
            {errors.desc && <p className="text-[11px] text-destructive">{errors.desc}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">System Prompt</Label>
            <Textarea rows={4} value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
              placeholder="定义角色定位、职责边界与输出格式，例如：你是资料整理助手，仅在 workspace/notes 目录内工作。" aria-invalid={!!errors.systemPrompt} />
            {errors.systemPrompt && <p className="text-[11px] text-destructive">{errors.systemPrompt}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">默认模型</Label>
              <Select value={form.modelId} onValueChange={(v) => setForm({ ...form, modelId: v })}>
                <SelectTrigger aria-invalid={!!errors.modelId}><SelectValue placeholder="选择模型" /></SelectTrigger>
                <SelectContent>
                  {models.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.modelId && <p className="text-[11px] text-destructive">{errors.modelId}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">标签（逗号分隔）</Label>
              <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="写作, 整理" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-xs">可用工具</Label>
            <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-3">
              {tools.map((t: any) => (
                <label key={t.key} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.toolKeys.includes(t.key)} onCheckedChange={() => toggleTool(t.key)} />
                  <span>{t.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-xs">启用 Skills</Label>
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 max-h-40 overflow-y-auto">
              {skills.map((s: any) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.skillIds.includes(s.id)} onCheckedChange={() => toggleSkill(s.id)} />
                  <span className="truncate">{s.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button className="bg-brand text-brand-foreground hover:opacity-90" onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



