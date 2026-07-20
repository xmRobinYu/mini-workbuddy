import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Download,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  Send,
  Terminal,
  X,
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
import { cn } from "@/lib/utils";
import {
  agentsApi,
  chatApi,
  conversationsApi,
  toolsApi,
  type AgentViewModel,
  type BuiltinTool,
  type ConversationDetail,
  type ConversationSummary,
  type OutputFile,
} from "@/lib/api";

export const Route = createFileRoute("/")({
  component: ChatPage,
});

type Attachment = {
  id: string;
  name: string;
  size: number;
  kind: "image" | "file";
  file: File;
};

type ToolPart =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | {
      type: "tool";
      callId: string;
      name: string;
      args: string;
      result: string;
      status: "running" | "done" | "error";
    };

type Message =
  | { id: string; role: "user"; text: string; attachments: Attachment[] }
  | { id: string; role: "assistant"; streaming?: boolean; parts: ToolPart[] };

function humanBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatSessionTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}

function valueFrom(data: Record<string, unknown>, key: string): string {
  return typeof data[key] === "string" ? data[key] : "";
}

function recordFrom(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function appendContent(parts: ToolPart[], text: string): ToolPart[] {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part.type === "text") {
      return parts.map((item, itemIndex) =>
        itemIndex === index && item.type === "text" ? { ...item, text: item.text + text } : item,
      );
    }
  }
  return [...parts, { type: "text", text }];
}

function restoreMessages(events: ConversationDetail["events"]): Message[] {
  const messages: Message[] = [];
  const toolLocations = new Map<string, { messageIndex: number; partIndex: number }>();

  events.forEach((event, index) => {
    const data = recordFrom(event.data) ?? {};
    if (event.role === "user") {
      const uploaded = Array.isArray(data.uploaded_file_paths) ? data.uploaded_file_paths : [];
      messages.push({
        id: `history-user-${index}`,
        role: "user",
        text: valueFrom(data, "text"),
        attachments: uploaded
          .filter((path): path is string => typeof path === "string")
          .map((path, attachmentIndex) => ({
            id: `history-upload-${index}-${attachmentIndex}`,
            name: path.split("/").at(-1) ?? path,
            size: 0,
            kind: "file",
            file: new File([], path),
          })),
      });
      return;
    }

    if (event.role === "assistant" && event.type === "thinking") {
      messages.push({
        id: `history-thinking-${index}`,
        role: "assistant",
        parts: [{ type: "thinking", text: valueFrom(data, "text") }],
      });
      return;
    }

    if (event.role === "assistant" && event.type === "tool_call") {
      const calls = Array.isArray(data.tool_calls) ? data.tool_calls : [];
      const parts: ToolPart[] = calls.flatMap((call, partIndex) => {
        const callRecord = recordFrom(call);
        const functionRecord = recordFrom(callRecord?.function);
        if (!callRecord || !functionRecord) return [];
        const callId = valueFrom(callRecord, "id");
        const part: ToolPart = {
          type: "tool",
          callId,
          name: valueFrom(functionRecord, "name"),
          args: valueFrom(functionRecord, "arguments"),
          result: "",
          status: "running",
        };
        toolLocations.set(callId, { messageIndex: messages.length, partIndex });
        return [part];
      });
      if (parts.length) messages.push({ id: `history-tool-${index}`, role: "assistant", parts });
      return;
    }

    if (event.role === "tool" && event.type === "tool_result") {
      const callId = valueFrom(event, "tool_call_id");
      const location = toolLocations.get(callId);
      const result = valueFrom(data, "result");
      const status = data.ok === false ? "error" : "done";
      if (location) {
        const message = messages[location.messageIndex];
        if (message?.role === "assistant") {
          const part = message.parts[location.partIndex];
          if (part?.type === "tool")
            message.parts[location.partIndex] = { ...part, result, status };
        }
      } else {
        messages.push({
          id: `history-result-${index}`,
          role: "assistant",
          parts: [
            {
              type: "tool",
              callId,
              name: valueFrom(data, "name"),
              args: "",
              result,
              status,
            },
          ],
        });
      }
      return;
    }

    if (event.role === "assistant" && event.type === "message") {
      const text = valueFrom(data, "text");
      if (text) {
        messages.push({
          id: `history-assistant-${index}`,
          role: "assistant",
          parts: [{ type: "text", text }],
        });
      }
    }
  });

  return messages;
}

function ChatPage() {
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<ConversationSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<Record<string, Message[]>>({});
  const [agents, setAgents] = useState<AgentViewModel[]>([]);
  const [tools, setTools] = useState<BuiltinTool[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const messages = activeSessionId ? (sessionMessages[activeSessionId] ?? []) : [];
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const availableTools = useMemo(
    () => tools.filter((tool) => tool.enabled && selectedAgent?.tools.includes(tool.name)),
    [selectedAgent, tools],
  );

  const setMessagesFor = useCallback(
    (conversationId: string, updater: Message[] | ((current: Message[]) => Message[])) => {
      setSessionMessages((current) => {
        const existing = current[conversationId] ?? [];
        const next = typeof updater === "function" ? updater(existing) : updater;
        return { ...current, [conversationId]: next };
      });
    },
    [],
  );

  const loadOutputs = useCallback(async (conversationId: string) => {
    try {
      setOutputs(await conversationsApi.outputs(conversationId));
    } catch (error) {
      toast.error("加载输出文件失败", {
        description: error instanceof Error ? error.message : "未知错误",
      });
    }
  }, []);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      try {
        const conversation = await conversationsApi.get(conversationId);
        setMessagesFor(conversationId, restoreMessages(conversation.events));
        await loadOutputs(conversationId);
      } catch (error) {
        toast.error("加载会话失败", {
          description: error instanceof Error ? error.message : "未知错误",
        });
      }
    },
    [loadOutputs, setMessagesFor],
  );

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const [conversationList, agentList, toolList] = await Promise.all([
        conversationsApi.list(),
        agentsApi.list(),
        toolsApi.list(),
      ]);
      setSessions(conversationList);
      setAgents(agentList);
      setTools(toolList);
      setSelectedAgentId(
        (current) =>
          current || agentList.find((agent) => agent.isDefault)?.id || agentList[0]?.id || "",
      );
      setActiveSessionId((current) => current || conversationList[0]?.id || null);
    } catch (error) {
      toast.error("无法连接工作台后端", {
        description: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (activeSessionId) void loadConversation(activeSessionId);
    else setOutputs([]);
  }, [activeSessionId, loadConversation]);

  const createSession = useCallback(async () => {
    const created = await conversationsApi.create("新对话");
    setSessions((current) => [created, ...current]);
    setSessionMessages((current) => ({ ...current, [created.id]: [] }));
    setActiveSessionId(created.id);
    setAttachments([]);
    return created;
  }, []);

  async function handleNewSession() {
    try {
      await createSession();
      setInput("");
      toast.success("已创建新对话");
    } catch (error) {
      toast.error("创建会话失败", {
        description: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    const added: Attachment[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      size: file.size,
      kind: file.type.startsWith("image/") ? "image" : "file",
      file,
    }));
    setAttachments((current) => [...current, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    if (!selectedAgent) {
      toast.error("请先在 Agent 页面配置可用的 Agent");
      return;
    }

    setSending(true);
    let conversationId = activeSessionId;
    try {
      if (!conversationId) conversationId = (await createSession()).id;
      const uploadedFilePaths = await Promise.all(
        attachments.map(
          async (attachment) => (await chatApi.upload(attachment.file, conversationId!)).path,
        ),
      );
      const assistantId = `assistant-${Date.now()}`;
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: "user",
        text,
        attachments,
      };
      setMessagesFor(conversationId, (current) => [
        ...current,
        userMessage,
        { id: assistantId, role: "assistant", streaming: true, parts: [] },
      ]);
      setInput("");
      setAttachments([]);

      await chatApi.send(
        { conversationId, agentId: selectedAgent.id, message: text, uploadedFilePaths },
        (event) => {
          setMessagesFor(conversationId!, (current) =>
            current.map((message) => {
              if (message.id !== assistantId || message.role !== "assistant") return message;
              if (event.event === "thinking") {
                return {
                  ...message,
                  parts: [
                    ...message.parts,
                    { type: "thinking", text: valueFrom(event.data, "text") },
                  ],
                };
              }
              if (event.event === "content") {
                return {
                  ...message,
                  parts: appendContent(message.parts, valueFrom(event.data, "text")),
                };
              }
              if (event.event === "tool_call") {
                const argumentsValue = event.data.arguments ?? {};
                return {
                  ...message,
                  parts: [
                    ...message.parts,
                    {
                      type: "tool",
                      callId: valueFrom(event.data, "id"),
                      name: valueFrom(event.data, "name"),
                      args: JSON.stringify(argumentsValue),
                      result: "",
                      status: "running",
                    },
                  ],
                };
              }
              if (event.event === "tool_result") {
                const callId = valueFrom(event.data, "id");
                const status = event.data.ok === false ? "error" : "done";
                return {
                  ...message,
                  parts: message.parts.map((part) =>
                    part.type === "tool" && part.callId === callId
                      ? { ...part, result: valueFrom(event.data, "result"), status }
                      : part,
                  ),
                };
              }
              if (event.event === "error") {
                return {
                  ...message,
                  parts: [
                    ...message.parts,
                    { type: "text", text: `执行失败：${valueFrom(event.data, "message")}` },
                  ],
                };
              }
              if (event.event === "done" && valueFrom(event.data, "note")) {
                return {
                  ...message,
                  parts: [...message.parts, { type: "text", text: valueFrom(event.data, "note") }],
                };
              }
              return message;
            }),
          );
        },
      );
      setSessions(await conversationsApi.list());
      await loadOutputs(conversationId);
    } catch (error) {
      toast.error("消息发送失败", {
        description: error instanceof Error ? error.message : "未知错误",
      });
    } finally {
      if (conversationId) {
        setMessagesFor(conversationId, (current) =>
          current.map((message) =>
            message.role === "assistant" && message.streaming
              ? { ...message, streaming: false }
              : message,
          ),
        );
      }
      setSending(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  const canSend = Boolean(input.trim()) && !sending;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="p-3">
          <Button
            onClick={() => void handleNewSession()}
            className="w-full justify-start gap-2 bg-brand text-brand-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> 新建对话
          </Button>
        </div>
        <ScrollArea className="flex-1 px-2">
          <div className="space-y-0.5 pb-4">
            {loading ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">正在加载会话…</p>
            ) : sessions.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">
                还没有会话，创建一个开始工作。
              </p>
            ) : (
              sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={session.id === activeSessionId}
                  onSelect={() => setActiveSessionId(session.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-semibold text-foreground">
                {activeSession?.title ?? "新对话"}
              </h2>
              <Badge
                variant="outline"
                className="border-brand/30 bg-brand-soft/50 text-[10px] text-foreground"
              >
                后端已持久化
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selectedAgent
                ? `已选 ${selectedAgent.name} · ${availableTools.length} 个已启用工具`
                : "请先配置 Agent"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={selectedAgentId}
              onValueChange={setSelectedAgentId}
              disabled={!agents.length || sending}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <Bot className="mr-1.5 h-3.5 w-3.5 text-brand" />
                <SelectValue placeholder="选择 Agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-3xl space-y-6 px-5 py-8">
              {messages.length ? (
                messages.map((message) =>
                  message.role === "user" ? (
                    <UserMessage key={message.id} message={message} />
                  ) : (
                    <AgentMessage
                      key={message.id}
                      message={message}
                      agentName={selectedAgent?.name ?? "Agent"}
                    />
                  ),
                )
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-surface/50 p-8 text-center text-sm text-muted-foreground">
                  新建会话后发送任务，消息、工具调用与输出文件都会保存到后端。
                </div>
              )}
            </div>
          </ScrollArea>

          <aside className="hidden w-72 shrink-0 border-l border-border bg-surface/60 lg:block">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">输出文件</h3>
                <p className="text-[11px] text-muted-foreground">此会话写入的后端产物</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="space-y-2 px-3 pb-4">
              {outputs.length ? (
                outputs.map((file) => (
                  <div
                    key={file.filename}
                    className="group flex items-center gap-2 rounded-lg border border-border bg-background p-2.5"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-soft text-brand">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">
                        {file.filename}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{humanBytes(file.size)}</p>
                    </div>
                    {activeSessionId && (
                      <a
                        href={conversationsApi.downloadUrl(activeSessionId, file.filename)}
                        download
                        className="text-muted-foreground hover:text-brand"
                        aria-label={`下载 ${file.filename}`}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  本会话暂未产生输出文件。
                </p>
              )}
            </div>
          </aside>
        </div>

        <div className="border-t border-border bg-background p-4">
          <div className="mx-auto max-w-3xl">
            <div className="card-warm p-2">
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-2 pt-1.5">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="group flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs"
                    >
                      {attachment.kind === "image" ? (
                        <ImageIcon className="h-3.5 w-3.5 text-brand" />
                      ) : (
                        <FileIcon className="h-3.5 w-3.5 text-brand" />
                      )}
                      <span className="max-w-[160px] truncate">{attachment.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {humanBytes(attachment.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`移除 ${attachment.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                disabled={sending}
                placeholder="描述要执行的任务，Shift+Enter 换行"
                className="min-h-[68px] resize-none border-0 bg-transparent px-2 py-2 text-sm shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center gap-1 px-1 pb-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => onPickFiles(event.target.files)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-muted-foreground"
                  disabled={sending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-3.5 w-3.5" /> 附件
                  {attachments.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                      {attachments.length}
                    </Badge>
                  )}
                </Button>
                <span className="ml-2 truncate text-[11px] text-muted-foreground">
                  {availableTools.length
                    ? availableTools.map((tool) => tool.name).join(" · ")
                    : "当前 Agent 未绑定已启用工具"}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!canSend}
                    onClick={() => void handleSend()}
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
              Enter 发送 · Shift+Enter 换行 · 附件会上传到当前会话
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function SessionItem({
  session,
  active,
  onSelect,
}: {
  session: ConversationSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left transition-colors",
        active ? "bg-brand-soft" : "hover:bg-accent/50",
      )}
    >
      <span className="truncate text-[13px] font-medium text-foreground">{session.title}</span>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Bot className="h-3 w-3" />
        <span>{formatSessionTime(session.updated_at)}</span>
      </div>
    </button>
  );
}

function UserMessage({ message }: { message: Extract<Message, { role: "user" }> }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] space-y-2">
        {message.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {message.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[11px]"
              >
                <FileIcon className="h-3 w-3 text-brand" />
                <span className="max-w-[160px] truncate">{attachment.name}</span>
                {attachment.size > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {humanBytes(attachment.size)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="rounded-2xl rounded-tr-sm bg-brand px-4 py-2.5 text-sm leading-relaxed text-brand-foreground shadow-sm">
          {message.text}
        </div>
      </div>
    </div>
  );
}

function AgentMessage({
  message,
  agentName,
}: {
  message: Extract<Message, { role: "assistant" }>;
  agentName: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand ring-1 ring-brand/20">
        <Bot className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-3 text-sm leading-relaxed text-foreground">
        <div className="flex items-center gap-2">
          <span className="font-medium">{agentName}</span>
          {message.streaming && (
            <span className="flex items-center gap-1 text-[11px] text-brand">
              <Loader2 className="h-3 w-3 animate-spin" /> 生成中
            </span>
          )}
        </div>
        <div className="space-y-3">
          {message.parts.map((part, index) => {
            if (part.type === "text") return <p key={index}>{part.text}</p>;
            if (part.type === "thinking")
              return (
                <p
                  key={index}
                  className="rounded-md bg-surface px-3 py-2 text-xs text-muted-foreground"
                >
                  思考：{part.text}
                </p>
              );
            return <ToolCallView key={`${part.callId}-${index}`} part={part} />;
          })}
        </div>
      </div>
    </div>
  );
}

function ToolCallView({ part }: { part: Extract<ToolPart, { type: "tool" }> }) {
  const failed = part.status === "error";
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border/80 bg-background/50 px-3 py-2">
        <Terminal className="h-3.5 w-3.5 text-brand" />
        <span className="font-mono text-xs font-medium text-foreground">{part.name}</span>
        <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {part.args}
        </code>
        <div
          className={cn(
            "ml-auto flex items-center gap-1 text-[11px]",
            failed ? "text-destructive" : part.status === "done" ? "text-success" : "text-brand",
          )}
        >
          {part.status === "running" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> 执行中
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3 w-3" /> {failed ? "失败" : "完成"}
            </>
          )}
        </div>
      </div>
      {part.result && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {part.result}
        </pre>
      )}
    </div>
  );
}
