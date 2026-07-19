import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bot, Loader2, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  agentsApi,
  modelsApi,
  toolsApi,
  type AgentViewModel,
  type ModelViewModel,
  type BuiltinTool,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/agents")({
  component: AgentsPage,
});

type AgentEditor = {
  id: string | null;
  name: string;
  description: string;
  modelId: string | null;
  tools: string[];
  skills: string[];
  agentMd: string;
};

const EMPTY_EDITOR: AgentEditor = {
  id: null,
  name: "",
  description: "",
  modelId: null,
  tools: [],
  skills: [],
  agentMd: "",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function AgentsPage() {
  const [agents, setAgents] = useState<AgentViewModel[]>([]);
  const [models, setModels] = useState<ModelViewModel[]>([]);
  const [tools, setTools] = useState<BuiltinTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editor, setEditor] = useState<AgentEditor>(EMPTY_EDITOR);
  const [saving, setSaving] = useState(false);

  const enabledTools = useMemo(() => tools.filter((tool) => tool.enabled), [tools]);

  async function load() {
    setLoading(true);
    try {
      const [agentList, modelList, toolList] = await Promise.all([
        agentsApi.list(),
        modelsApi.list(),
        toolsApi.list(),
      ]);
      setAgents(agentList);
      setModels(modelList);
      setTools(toolList);
    } catch (error) {
      toast.error("加载 Agent 配置失败", { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditor(EMPTY_EDITOR);
    setDialogOpen(true);
  }

  async function openEdit(agent: AgentViewModel) {
    try {
      const agentMd = await agentsApi.getMarkdown(agent.id);
      setEditor({
        id: agent.id,
        name: agent.name,
        description: agent.description,
        modelId: agent.modelId,
        tools: agent.tools,
        skills: agent.skills,
        agentMd,
      });
      setDialogOpen(true);
    } catch (error) {
      toast.error("加载 Agent 提示词失败", { description: errorMessage(error) });
    }
  }

  async function save() {
    if (!editor.name.trim()) {
      toast.error("请填写 Agent 名称");
      return;
    }
    setSaving(true);
    const payload = {
      name: editor.name,
      description: editor.description,
      model_id: editor.modelId,
      tools: editor.tools,
      skills: editor.skills,
    };
    try {
      const saved = editor.id
        ? await agentsApi.update(editor.id, payload)
        : await agentsApi.create(payload);
      await agentsApi.saveMarkdown(saved.id, editor.agentMd);
      setAgents((current) =>
        editor.id
          ? current.map((agent) => (agent.id === saved.id ? saved : agent))
          : [...current, saved],
      );
      setDialogOpen(false);
      toast.success(editor.id ? "Agent 已更新" : "Agent 已创建");
    } catch (error) {
      toast.error("保存 Agent 失败", { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function remove(agent: AgentViewModel) {
    try {
      await agentsApi.remove(agent.id);
      setAgents((current) => current.filter((item) => item.id !== agent.id));
      toast.success("Agent 已删除");
    } catch (error) {
      toast.error("删除 Agent 失败", { description: errorMessage(error) });
    }
  }

  function toggleTool(name: string) {
    setEditor((current) => ({
      ...current,
      tools: current.tools.includes(name)
        ? current.tools.filter((item) => item !== name)
        : [...current.tools, name],
    }));
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-5">
      <PageHeader
        title="Agent"
        subtitle="将真实模型、内置工具和系统提示词组合为可执行的工作单元。"
        action={
          <Button
            onClick={openCreate}
            className="gap-2 bg-brand text-brand-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> 新建 Agent
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-brand" />
        </div>
      ) : agents.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Bot}
            title="还没有 Agent"
            description="创建 Agent 后即可在聊天页选择并执行任务。"
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => {
            const model = models.find((item) => item.id === agent.modelId);
            return (
              <article key={agent.id} className="card-warm flex flex-col p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-display text-base font-semibold">
                        {agent.name}
                      </h2>
                      {agent.isDefault && (
                        <Badge variant="outline" className="text-[10px]">
                          主 Agent
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {agent.description || "未填写说明"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <p>模型：{model?.name ?? "未关联"}</p>
                  <p className="flex items-center gap-1">
                    <Wrench className="h-3 w-3" /> {agent.tools.length} 个可用工具
                  </p>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => void openEdit(agent)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> 编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={agent.isDefault}
                    onClick={() => void remove(agent)}
                    aria-label={`删除 ${agent.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editor.id ? "编辑 Agent" : "新建 Agent"}</DialogTitle>
            <DialogDescription>
              保存后，聊天页会使用这里的模型、工具和系统提示词执行任务。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="agent-name">名称</Label>
              <Input
                id="agent-name"
                value={editor.name}
                onChange={(event) => setEditor({ ...editor, name: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="agent-description">简介</Label>
              <Input
                id="agent-description"
                value={editor.description}
                onChange={(event) => setEditor({ ...editor, description: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>关联模型</Label>
              <Select
                value={editor.modelId ?? "__none__"}
                onValueChange={(value) =>
                  setEditor({ ...editor, modelId: value === "__none__" ? null : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择模型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">暂不关联</SelectItem>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>可用工具</Label>
              <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-3">
                {enabledTools.map((tool) => (
                  <label key={tool.name} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={editor.tools.includes(tool.name)}
                      onCheckedChange={() => toggleTool(tool.name)}
                    />
                    {tool.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="agent-md">系统提示词</Label>
              <Textarea
                id="agent-md"
                rows={6}
                value={editor.agentMd}
                onChange={(event) => setEditor({ ...editor, agentMd: event.target.value })}
                placeholder="定义角色、边界与输出格式。"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              disabled={saving}
              onClick={() => void save()}
              className="bg-brand text-brand-foreground hover:opacity-90"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
