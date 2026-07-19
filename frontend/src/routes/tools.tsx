import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Loader2, ShieldCheck, Terminal, Wrench } from "lucide-react";
import { toast } from "sonner";
import { toolsApi, type BuiltinTool } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/tools")({
  component: ToolsPage,
});

function toolIcon(name: string) {
  if (name === "read_file") return FileText;
  if (name === "write_file") return Wrench;
  return Terminal;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function ToolsPage() {
  const [tools, setTools] = useState<BuiltinTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setTools(await toolsApi.list());
    } catch (error) {
      toast.error("加载工具配置失败", { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(tool: BuiltinTool, enabled: boolean) {
    setUpdating(tool.name);
    try {
      const updated = await toolsApi.toggle(tool.name, enabled);
      setTools((current) =>
        current.map((item) =>
          item.name === updated.name ? { ...item, enabled: updated.enabled } : item,
        ),
      );
      toast.success(`${tool.name} 已${enabled ? "启用" : "停用"}`);
    } catch (error) {
      toast.error("更新工具失败", { description: errorMessage(error) });
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-5">
      <PageHeader
        title="工具"
        subtitle="内置工具由后端统一执行，关闭后所有 Agent 都无法调用该工具。"
      />
      <div className="mt-5 flex items-start gap-3 rounded-lg border border-brand/25 bg-brand-soft/40 p-3 text-sm text-foreground/80">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p>文件路径、命令黑名单、超时和输出大小限制由后端执行，前端不会绕过这些安全边界。</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-brand" />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {tools.map((tool) => {
            const Icon = toolIcon(tool.name);
            return (
              <article key={tool.name} className="card-warm flex items-start gap-4 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-base font-semibold">{tool.name}</h2>
                    <Badge variant="outline" className="text-[10px]">
                      内置
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Switch
                    checked={tool.enabled}
                    disabled={updating === tool.name}
                    onCheckedChange={(enabled) => void toggle(tool, enabled)}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {updating === tool.name ? "保存中" : tool.enabled ? "已启用" : "已停用"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
