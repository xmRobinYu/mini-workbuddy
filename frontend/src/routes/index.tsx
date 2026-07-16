import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Paperclip,
  Send,
  Sparkles,
  Terminal,
  FileText,
  ChevronDown,
  Bot,
  MoreHorizontal,
  Download,
  CheckCircle2,
  Loader2,
  X,
  Image as ImageIcon,
  File as FileIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  useStore,
  toolsStore,
  skillsStore,
  type Tool,
  type Skill,
} from "@/lib/mock-store";

export const Route = createFileRoute("/")({
  component: ChatPage,
});

const initialSessions: Session[] = [
  { id: "1", title: "重构工作台首页布局", agent: "主 Agent", time: "刚刚" },
  { id: "2", title: "整理本周会议纪要 → Markdown", agent: "文档助手", time: "2 小时前" },
  { id: "3", title: "扫描 workspace 生成技能索引", agent: "主 Agent", time: "昨天" },
  { id: "4", title: "为 PRD 生成用户故事清单", agent: "产品经理", time: "昨天" },
  { id: "5", title: "调试 SSE 断线重连逻辑", agent: "代码助手", time: "3 天前" },
  { id: "6", title: "翻译 README 为英文版本", agent: "翻译助手", time: "上周" },
];

type Session = { id: string; title: string; agent: string; time: string };


type Attachment = { id: string; name: string; size: number; kind: "image" | "file" };

type ToolPart =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; args: string; result: string; status: "running" | "done" }
  | { type: "skill"; name: string; detail: string; status: "running" | "done" };

type Message =
  | { id: string; role: "user"; text: string; attachments: Attachment[]; skills: string[]; tools: string[] }
  | { id: string; role: "assistant"; streaming?: boolean; parts: ToolPart[] };

const seedMessages: Message[] = [
  {
    id: "u1",
    role: "user",
    text: "帮我把工作台首页重构一下，我想要一个更暖色调的极简风格，参考 Linear 的信息密度但用米色系。",
    attachments: [],
    skills: [],
    tools: [],
  },
  {
    id: "a1",
    role: "assistant",
    parts: [
      { type: "text", text: "好的，我来帮你重构。计划分为四步：先梳理当前布局结构，再更新设计 token，接着调整核心组件，最后跑一遍视觉回归。开始执行 ↓" },
      { type: "tool", name: "read_file", status: "done", args: "src/routes/index.tsx", result: "读取到当前首页组件，共 187 行" },
      { type: "tool", name: "read_file", status: "done", args: "src/styles.css", result: "读取设计系统 token，已识别 24 个 CSS 变量" },
      { type: "skill", name: "ui-design-system", status: "done", detail: "调用『暖色调极简风格生成器』技能 · 已产出 8 条 token 建议" },
      { type: "tool", name: "write_file", status: "done", args: "src/styles.css", result: "写入新的 oklch 色板，覆盖 12 个变量" },
      { type: "text", text: "主色调换成了 oklch(0.6 0.14 42) 的赤陶色，背景改成低饱和度米白色。" },
    ],
  },
];

function humanBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function ChatPage() {
  const [input, setInput] = useState("");

  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<string>(initialSessions[0].id);
  const [sessionMessages, setSessionMessages] = useState<Record<string, Message[]>>({
    [initialSessions[0].id]: seedMessages,
  });
  const messages = sessionMessages[activeSessionId] ?? [];
  const setMessages = (updater: Message[] | ((prev: Message[]) => Message[])) => {
    setSessionMessages((prev) => {
      const curr = prev[activeSessionId] ?? [];
      const next = typeof updater === "function" ? (updater as (p: Message[]) => Message[])(curr) : updater;
      return { ...prev, [activeSessionId]: next };
    });
  };
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tools = useStore<Tool>(toolsStore).filter((t) => t.enabled);
  const skills = useStore<Skill>(skillsStore).filter((s) => s.enabled);


  function handleNewSession() {
    const id = `s-${Date.now()}`;
    const newSession: Session = { id, title: "新对话", agent: "主 Agent", time: "刚刚" };
    setSessions((prev) => [newSession, ...prev]);
    setSessionMessages((prev) => ({ ...prev, [id]: [] }));
    setActiveSessionId(id);
    setInput("");
    setAttachments([]);
    setSelectedSkills([]);
    setSelectedTools([]);
    toast.success("已创建新对话");
  }

  const canSend = (input.trim().length > 0 || attachments.length > 0) && !sending;


  function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const added: Attachment[] = Array.from(files).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      size: f.size,
      kind: f.type.startsWith("image/") ? "image" : "file",
    }));
    setAttachments((prev) => [...prev, ...added]);
    toast.success(`已添加 ${added.length} 个附件`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function toggleFrom(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function handleSend() {
    if (!canSend) return;
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text: input.trim(),
      attachments,
      skills: selectedSkills,
      tools: selectedTools,
    };
    const assistantId = `a-${Date.now()}`;
    const parts: ToolPart[] = [];
    selectedSkills.forEach((sid) => {
      const s = skills.find((x) => x.id === sid);
      if (s) parts.push({ type: "skill", name: s.slug, status: "running", detail: `准备调用「${s.name}」` });
    });
    selectedTools.forEach((tk) => {
      const t = tools.find((x) => x.key === tk);
      if (t) parts.push({ type: "tool", name: t.key, status: "running", args: "prepare()", result: "初始化中..." });
    });
    parts.push({ type: "text", text: "" });

    const assistant: Message = { id: assistantId, role: "assistant", streaming: true, parts };
    setMessages((m) => [...m, userMsg, assistant]);
    setInput("");
    setAttachments([]);
    setSending(true);

    // Mock: finalize after latency
    setTimeout(() => {
      setMessages((m) =>
        m.map((msg) => {
          if (msg.id !== assistantId || msg.role !== "assistant") return msg;
          const finalParts: ToolPart[] = msg.parts.map((p) => {
            if (p.type === "tool") return { ...p, status: "done", result: `${p.name} 执行完成 · 模拟数据` };
            if (p.type === "skill") return { ...p, status: "done", detail: `${p.detail}，已产出建议 ×3` };
            if (p.type === "text") return { type: "text", text: mockReply(userMsg.text) };
            return p;
          });
          return { ...msg, streaming: false, parts: finalParts };
        }),
      );
      setSending(false);
    }, 1200);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full">
      {/* Session list */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="p-3">
          <Button
            onClick={handleNewSession}
            className="w-full justify-start gap-2 bg-brand text-brand-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            新建对话
          </Button>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="搜索会话..." className="h-9 pl-8 bg-background" />
          </div>
        </div>
        <ScrollArea className="flex-1 px-2">
          <div className="space-y-0.5 pb-4">
            <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              今天
            </div>
            {sessions.slice(0, 3).map((s) => (
              <SessionItem key={s.id} s={s} active={s.id === activeSessionId} onSelect={() => setActiveSessionId(s.id)} />
            ))}
            <div className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              更早
            </div>
            {sessions.slice(3).map((s) => (
              <SessionItem key={s.id} s={s} active={s.id === activeSessionId} onSelect={() => setActiveSessionId(s.id)} />
            ))}

          </div>
        </ScrollArea>
      </aside>

      {/* Chat area */}
      <section className="flex flex-1 flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-semibold text-foreground">
                {activeSession.title}

              </h2>
              <Badge variant="outline" className="border-brand/30 bg-brand-soft/50 text-[10px] text-foreground">
                执行轮次 · {Math.floor(messages.length / 2)}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              上下文 8.2k / 128k · 已保存 2 条长期记忆
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Select defaultValue="main">
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <Bot className="mr-1.5 h-3.5 w-3.5 text-brand" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">主 Agent</SelectItem>
                <SelectItem value="doc">文档助手</SelectItem>
                <SelectItem value="code">代码助手</SelectItem>
                <SelectItem value="pm">产品经理</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex flex-1 overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-3xl space-y-6 px-5 py-8">
              {messages.map((m) =>
                m.role === "user" ? (
                  <UserMessage key={m.id} msg={m} />
                ) : (
                  <AgentMessage key={m.id} msg={m} />
                ),
              )}
            </div>
          </ScrollArea>

          {/* Output panel */}
          <aside className="hidden w-72 shrink-0 border-l border-border bg-surface/60 lg:block">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">输出文件</h3>
                <p className="text-[11px] text-muted-foreground">本轮会话产出的资源</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2 px-3 pb-4">
              {[
                { name: "styles.css", size: "12.4 kb", type: "css" },
                { name: "index.tsx", size: "8.1 kb", type: "tsx" },
                { name: "app-sidebar.tsx", size: "3.2 kb", type: "tsx" },
                { name: "design-report.md", size: "1.6 kb", type: "md" },
              ].map((f) => (
                <div
                  key={f.name}
                  className="group flex items-center gap-2 rounded-lg border border-border bg-background p-2.5 hover:border-brand/40 transition-colors"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-soft text-brand">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{f.name}</p>
                    <p className="text-[10px] text-muted-foreground">{f.size} · {f.type}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </aside>
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-background p-4">
          <div className="mx-auto max-w-3xl">
            <div className="card-warm p-2">
              {/* attachments preview */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-2 pt-1.5">
                  {attachments.map((a) => (
                    <div
                      key={a.id}
                      className="group flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs"
                    >
                      {a.kind === "image" ? (
                        <ImageIcon className="h-3.5 w-3.5 text-brand" />
                      ) : (
                        <FileIcon className="h-3.5 w-3.5 text-brand" />
                      )}
                      <span className="max-w-[160px] truncate">{a.name}</span>
                      <span className="text-[10px] text-muted-foreground">{humanBytes(a.size)}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="描述要执行的任务，Shift+Enter 换行"
                className="min-h-[68px] resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center gap-1 px-1 pb-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => onPickFiles(e.target.files)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-muted-foreground"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-3.5 w-3.5" /> 附件
                  {attachments.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">{attachments.length}</Badge>
                  )}
                </Button>

                <PickerPopover
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                  label="Skills"
                  count={selectedSkills.length}
                  emptyText="没有可用的技能包，请先在「Skills」中启用"
                  items={skills.map((s) => ({ id: s.id, name: s.name, desc: s.desc }))}
                  selected={selectedSkills}
                  onToggle={(id) => toggleFrom(selectedSkills, setSelectedSkills, id)}
                />

                <PickerPopover
                  icon={<Terminal className="h-3.5 w-3.5" />}
                  label="工具"
                  count={selectedTools.length}
                  emptyText="没有可用的工具，请先在「工具」中启用"
                  items={tools.map((t) => ({ id: t.key, name: t.name, desc: t.desc }))}
                  selected={selectedTools}
                  onToggle={(id) => toggleFrom(selectedTools, setSelectedTools, id)}
                />

                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">DeepSeek Chat · 128k</span>
                  <Button
                    size="sm"
                    disabled={!canSend}
                    onClick={handleSend}
                    className="h-8 gap-1.5 bg-brand text-brand-foreground hover:opacity-90 disabled:opacity-40"
                  >
                    {sending ? (
                      <>
                        生成中 <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </>
                    ) : (
                      <>
                        发送 <Send className="h-3.5 w-3.5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Enter 发送 · Shift+Enter 换行 · 附件与工具/Skill 仅在本次会话中生效
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function mockReply(userText: string) {
  if (!userText) return "已收到你的附件，正在分析...";
  const trimmed = userText.length > 40 ? `${userText.slice(0, 40)}...` : userText;
  return `已收到指令「${trimmed}」。这是一段 mock 回复，展示消息流与工具调用面板效果。`;
}

function PickerPopover({
  icon, label, count, items, selected, onToggle, emptyText,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  items: { id: string; name: string; desc: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  emptyText: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => items.filter((i) => `${i.name} ${i.desc}`.toLowerCase().includes(q.toLowerCase())),
    [items, q],
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground">
          {icon} {label}
          {count > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{count}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`搜索 ${label}...`}
              className="h-8 bg-surface pl-8 text-xs"
            />
          </div>
        </div>
        <ScrollArea className="max-h-72">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">{items.length === 0 ? emptyText : "无匹配结果"}</div>
          ) : (
            <ul className="p-1">
              {filtered.map((i) => {
                const on = selected.includes(i.id);
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(i.id)}
                      className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent/50"
                    >
                      <Checkbox checked={on} className="mt-0.5" tabIndex={-1} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{i.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{i.desc}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function SessionItem({ s, active, onSelect }: { s: Session; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left transition-colors",
        active ? "bg-brand-soft" : "hover:bg-accent/50",
      )}
    >
      <span className={cn("truncate text-[13px] font-medium", active ? "text-foreground" : "text-foreground/90")}>
        {s.title}
      </span>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Bot className="h-3 w-3" />
        <span className="truncate">{s.agent}</span>
        <span className="ml-auto">{s.time}</span>
      </div>
    </button>
  );
}


function UserMessage({ msg }: { msg: Extract<Message, { role: "user" }> }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] space-y-2">
        {msg.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {msg.attachments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[11px]"
              >
                {a.kind === "image" ? (
                  <ImageIcon className="h-3 w-3 text-brand" />
                ) : (
                  <FileIcon className="h-3 w-3 text-brand" />
                )}
                <span className="max-w-[160px] truncate">{a.name}</span>
                <span className="text-[10px] text-muted-foreground">{humanBytes(a.size)}</span>
              </div>
            ))}
          </div>
        )}
        {msg.text && (
          <div className="rounded-2xl rounded-tr-sm bg-brand px-4 py-2.5 text-sm leading-relaxed text-brand-foreground shadow-sm">
            {msg.text}
          </div>
        )}
        {(msg.skills.length > 0 || msg.tools.length > 0) && (
          <div className="flex flex-wrap justify-end gap-1">
            {msg.skills.map((id) => (
              <Badge key={`s-${id}`} variant="outline" className="border-brand/30 bg-brand-soft/40 text-[10px]">
                <Sparkles className="mr-1 h-2.5 w-2.5" /> {id}
              </Badge>
            ))}
            {msg.tools.map((id) => (
              <Badge key={`t-${id}`} variant="outline" className="text-[10px]">
                <Terminal className="mr-1 h-2.5 w-2.5" /> {id}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentMessage({ msg }: { msg: Extract<Message, { role: "assistant" }> }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand ring-1 ring-brand/20">
        <Bot className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-3 text-sm leading-relaxed text-foreground">
        <div className="flex items-center gap-2">
          <span className="font-medium">主 Agent</span>
          {msg.streaming && (
            <span className="flex items-center gap-1 text-[11px] text-brand">
              <Loader2 className="h-3 w-3 animate-spin" /> 生成中
            </span>
          )}
        </div>
        <div className="space-y-3">
          {msg.parts.map((p, i) => {
            if (p.type === "text") {
              if (!p.text) return null;
              return <p key={i}>{p.text}</p>;
            }
            if (p.type === "tool") {
              return <ToolCallView key={i} name={p.name} status={p.status} args={p.args} result={p.result} />;
            }
            return <SkillCallView key={i} name={p.name} status={p.status} detail={p.detail} />;
          })}
        </div>
      </div>
    </div>
  );
}

function ToolCallView({
  name, status, args, result,
}: {
  name: string;
  status: "running" | "done" | "error";
  args: string;
  result: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border/80 bg-background/50 px-3 py-2">
        <Terminal className="h-3.5 w-3.5 text-brand" />
        <span className="font-mono text-xs font-medium text-foreground">{name}</span>
        <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {args}
        </code>
        <div className="ml-auto">
          {status === "done" && (
            <span className="flex items-center gap-1 text-[11px] text-success">
              <CheckCircle2 className="h-3 w-3" /> 完成
            </span>
          )}
          {status === "running" && (
            <span className="flex items-center gap-1 text-[11px] text-brand">
              <Loader2 className="h-3 w-3 animate-spin" /> 执行中
            </span>
          )}
        </div>
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {result}
      </pre>
    </div>
  );
}

function SkillCallView({
  name, status, detail,
}: {
  name: string;
  status: "running" | "done";
  detail: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand-soft/40 px-3 py-2">
      <Sparkles className="h-3.5 w-3.5 text-brand" />
      <span className="font-mono text-xs font-medium text-foreground">{name}</span>
      <span className="truncate text-xs text-muted-foreground">{detail}</span>
      <span className="ml-auto text-[11px] text-success">
        {status === "done" ? "✓ 完成" : "执行中"}
      </span>
    </div>
  );
}
