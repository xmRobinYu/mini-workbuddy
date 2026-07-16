import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  historyStores,
  rollbackHistory,
  clearHistory,
  useStore,
  ENTITY_LABELS,
  type EntityKind,
  type HistoryEntry,
} from "@/lib/mock-store";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "变更历史 · Mini-WorkBuddy" },
      { name: "description", content: "查看并回滚模型、工具、Skills、Agent 的历史配置版本。" },
    ],
  }),
  component: HistoryPage,
});

const ENTITIES: EntityKind[] = ["models", "tools", "skills", "agents"];

function fmt(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function HistoryPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-5">
      <PageHeader
        title="变更历史"
        subtitle="记录每次配置变更的快照，可一键回滚到任意历史版本。最多保留最近 30 条。"
      />

      <div className="mt-5">
        <Tabs defaultValue="models">
          <TabsList>
            {ENTITIES.map((e) => (
              <TabsTrigger key={e} value={e}>
                {ENTITY_LABELS[e]}
              </TabsTrigger>
            ))}
          </TabsList>
          {ENTITIES.map((e) => (
            <TabsContent key={e} value={e} className="mt-4">
              <EntityHistory entity={e} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function EntityHistory({ entity }: { entity: EntityKind }) {
  const entries = useStore<HistoryEntry>(historyStores[entity]);
  const [pending, setPending] = useState<HistoryEntry | null>(null);
  const [clearing, setClearing] = useState(false);

  const list = useMemo(() => entries, [entries]);

  function onRollback(entry: HistoryEntry) {
    const ok = rollbackHistory(entity, entry.id);
    if (ok) {
      toast.success(`已回滚到「${entry.label}」`);
    } else {
      toast.error("版本不存在");
    }
    setPending(null);
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-sm text-muted-foreground">
          共 {list.length} 条历史 · {ENTITY_LABELS[entity]} 配置
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-muted-foreground hover:text-destructive"
          onClick={() => setClearing(true)}
          disabled={list.length <= 1}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          清空历史
        </Button>
      </div>
      {list.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">暂无变更记录</div>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((entry, idx) => {
            const isCurrent = idx === 0;
            const itemCount = Array.isArray(entry.snapshot) ? entry.snapshot.length : 0;
            return (
              <li key={entry.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surface-elevated text-xs font-mono text-muted-foreground">
                  {list.length - idx}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{entry.label}</span>
                    {isCurrent && (
                      <Badge variant="secondary" className="h-5 text-[10px]">当前</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {fmt(entry.ts)}
                    </span>
                    <span>{itemCount} 项</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={isCurrent}
                  onClick={() => setPending(entry)}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  回滚
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>回滚到该版本？</AlertDialogTitle>
            <AlertDialogDescription>
              将把 <b>{ENTITY_LABELS[entity]}</b> 配置替换为「{pending?.label}」（{pending && fmt(pending.ts)}）的快照。当前状态会自动记录一条新的历史，方便再次回滚。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && onRollback(pending)}>
              确认回滚
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearing} onOpenChange={setClearing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空 {ENTITY_LABELS[entity]} 的历史？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除所有历史快照，仅保留一条「清空历史」标记。此操作不影响当前配置本身。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearHistory(entity);
                toast.success("已清空历史");
                setClearing(false);
              }}
            >
              清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
