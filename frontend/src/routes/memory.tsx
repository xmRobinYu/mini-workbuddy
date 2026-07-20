import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Brain, Clock, Archive, Save, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  memoryApi,
  type LongTermMemoryViewModel,
  type MemoryStatsViewModel,
  type ShortTermMemoryViewModel,
} from "@/lib/api";

export const Route = createFileRoute("/memory")({
  component: MemoryPage,
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MemoryPage() {
  const [stats, setStats] = useState<MemoryStatsViewModel | null>(null);
  const [longTerm, setLongTerm] = useState<LongTermMemoryViewModel | null>(null);
  const [shortTerm, setShortTerm] = useState<ShortTermMemoryViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [s, lt, st] = await Promise.all([
        memoryApi.getStats(),
        memoryApi.getLongTerm(),
        memoryApi.getShortTerm(),
      ]);
      setStats(s);
      setLongTerm(lt);
      setShortTerm(st);
    } catch (error) {
      toast.error("加载记忆失败", { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const longTermBytes = longTerm?.bytes ?? 0;
  const longTermMaxBytes = longTerm?.maxBytes ?? stats?.longTermMaxBytes ?? 50 * 1024;
  const longTermPct =
    longTermMaxBytes > 0 ? Math.min(100, (longTermBytes / longTermMaxBytes) * 100) : 0;

  const shortTermItems = shortTerm?.totalItems ?? stats?.shortTermItems ?? 0;
  const shortTermFiles = shortTerm?.files.length ?? stats?.shortTermFiles ?? 0;
  const shortTermPct = Math.min(100, (shortTermFiles / 7) * 100);

  const archivedItems = stats?.archivedItems ?? 0;

  async function openEdit() {
    setDraft(longTerm?.content ?? "");
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await memoryApi.putLongTerm(draft);
      setLongTerm(updated);
      setStats((cur) =>
        cur
          ? {
              ...cur,
              longTermBytes: updated.bytes,
              longTermItems: updated.items,
            }
          : cur,
      );
      setEditing(false);
      toast.success("长期记忆已保存");
    } catch (error) {
      toast.error("保存长期记忆失败", { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-5">
      <PageHeader
        title="记忆"
        subtitle="长期记忆持久保存跨会话事实，短期记忆按天归档，7 天后自动清理。"
      />

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="card-warm p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Brain className="h-4 w-4 text-brand" /> 长期记忆
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold text-foreground">
              {formatBytes(longTermBytes)}
            </span>
            <span className="text-sm text-muted-foreground">/ {formatBytes(longTermMaxBytes)}</span>
          </div>
          <Progress value={longTermPct} className="mt-3 h-1.5" />
          <p className="mt-2 text-[11px] text-muted-foreground">
            达到 {formatBytes(longTermMaxBytes)} 上限时自动触发摘要压缩
          </p>
        </div>
        <div className="card-warm p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 text-brand" /> 短期记忆
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold text-foreground">
              {shortTermItems}
            </span>
            <span className="text-sm text-muted-foreground">条 · {shortTermFiles} 天</span>
          </div>
          <Progress value={shortTermPct} className="mt-3 h-1.5" />
          <p className="mt-2 text-[11px] text-muted-foreground">7 天后归档到 archive/</p>
        </div>
        <div className="card-warm p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Archive className="h-4 w-4 text-brand" /> 已归档
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-semibold text-foreground">
              {archivedItems}
            </span>
            <span className="text-sm text-muted-foreground">条历史</span>
          </div>
          <Progress value={Math.min(100, archivedItems)} className="mt-3 h-1.5" />
          <p className="mt-2 text-[11px] text-muted-foreground">可通过 search_memory 检索</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card-warm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h3 className="font-display text-base font-semibold text-foreground">长期记忆</h3>
              <p className="text-xs text-muted-foreground">
                memory.md · 自动注入所有会话的系统提示词
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void openEdit()}
                disabled={loading}
              >
                {editing ? <Loader2 className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}{" "}
                编辑
              </Button>
            </div>
          </div>
          {loading && longTerm === null ? (
            <div className="flex items-center justify-center px-4 py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中…
            </div>
          ) : longTerm && longTerm.content ? (
            <ul className="divide-y divide-border/60">
              {longTerm.content
                .split("\n")
                .filter((line) => line.trim())
                .map((m, i) => (
                  <li key={i} className="flex gap-3 px-4 py-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    <div className="flex-1">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {m}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">saved by save_memory</p>
                    </div>
                  </li>
                ))}
            </ul>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              暂无长期记忆，点击「编辑」写入第一条。
            </div>
          )}
        </div>

        <div className="card-warm overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-display text-base font-semibold text-foreground">短期记忆</h3>
            <p className="text-xs text-muted-foreground">按天归档 · memory/YYYY-MM-DD.md</p>
          </div>
          {loading && shortTerm === null ? (
            <div className="flex items-center justify-center px-4 py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载中…
            </div>
          ) : shortTerm && shortTerm.files.length > 0 ? (
            <ul className="divide-y divide-border/60">
              {shortTerm.files.map((d) => (
                <li key={d.filename} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="font-mono text-[13px] text-foreground">{d.date}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {d.items} 条 · {formatBytes(d.bytes)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              暂无短期记忆。
            </div>
          )}
        </div>
      </div>

      <div className="card-warm mt-5 p-5">
        <h3 className="font-display text-base font-semibold text-foreground">上下文压缩</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          使用 tiktoken 实时计算 token，达到窗口 75% 时自动触发压缩，保留最近 10% 原始消息 +
          摘要，支持多次压缩。
        </p>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">当前会话上下文</span>
            <span className="text-muted-foreground">
              <span className="font-mono">0</span> / 128,000 tokens
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-brand" style={{ width: "0%" }} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">暂无活跃会话上下文</p>
        </div>
      </div>

      <Dialog open={editing} onOpenChange={(o) => !saving && setEditing(o)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑长期记忆</DialogTitle>
            <DialogDescription>
              全量替换 memory.md，单次写入上限 {formatBytes(longTermMaxBytes)}。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            className="font-mono text-sm"
            placeholder="每行一条长期记忆…"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={() => void save()} disabled={saving} className="gap-1.5">
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}{" "}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
