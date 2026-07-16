import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Link2, Plug, X, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  connectorsStore, useStore, type Connector, type ConnectorBinding, type ConnectorType,
} from "@/lib/mock-store";
import { FieldHint } from "@/components/empty-state";

export type ActionParam = {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
};

export type ConnectorAction = {
  key: string;
  label: string;
  desc: string;
  params: ActionParam[];
};

export const CONNECTOR_ACTIONS: Record<ConnectorType, ConnectorAction[]> = {
  feishu: [
    {
      key: "send_message",
      label: "发送消息",
      desc: "im.v1/messages · 支持文本 / 富文本 / 卡片",
      params: [
        { key: "receive_id_type", label: "接收方类型", required: true, placeholder: "open_id / chat_id" },
        { key: "receive_id", label: "接收方 ID", required: true, placeholder: "${input.chatId}" },
        { key: "msg_type", label: "消息类型", required: true, placeholder: "text / post / interactive" },
        { key: "content", label: "消息内容", required: true, placeholder: "${input.text}", hint: "JSON 字符串或模板变量" },
      ],
    },
    {
      key: "upload_file",
      label: "上传文件",
      desc: "im.v1/files · 上传附件供后续消息引用",
      params: [
        { key: "file_type", label: "文件类型", required: true, placeholder: "stream / doc / pdf" },
        { key: "file_name", label: "文件名", required: true, placeholder: "${input.fileName}" },
      ],
    },
    {
      key: "get_user_info",
      label: "获取用户信息",
      desc: "contact.v3/users/{user_id}",
      params: [
        { key: "user_id", label: "用户 ID", required: true, placeholder: "${input.userId}" },
      ],
    },
  ],
  dingtalk: [
    {
      key: "send_group_message",
      label: "群机器人推送",
      desc: "robot/send · 通过 Webhook 推送到指定群",
      params: [
        { key: "msgtype", label: "消息类型", required: true, placeholder: "text / markdown / actionCard" },
        { key: "content", label: "消息正文", required: true, placeholder: "${input.text}" },
        { key: "at_mobiles", label: "@手机号", placeholder: "13800000000,13900000000" },
      ],
    },
    {
      key: "send_workflow",
      label: "发起审批", 
      desc: "topapi/processinstance/create",
      params: [
        { key: "process_code", label: "审批模板 Code", required: true, placeholder: "PROC-xxx" },
        { key: "originator_user_id", label: "发起人 UserId", required: true, placeholder: "${input.userId}" },
        { key: "form_values", label: "表单值", required: true, placeholder: "${input.form}", hint: "JSON 数组" },
      ],
    },
    {
      key: "get_department_users",
      label: "查询部门成员",
      desc: "topapi/user/listsimple",
      params: [
        { key: "dept_id", label: "部门 ID", required: true, placeholder: "1" },
      ],
    },
  ],
  wecom: [
    {
      key: "send_app_message",
      label: "应用消息",
      desc: "cgi-bin/message/send · 需 agentId",
      params: [
        { key: "touser", label: "接收人", required: true, placeholder: "UserID1|UserID2 或 @all" },
        { key: "msgtype", label: "消息类型", required: true, placeholder: "text / markdown / textcard" },
        { key: "content", label: "消息内容", required: true, placeholder: "${input.text}" },
      ],
    },
    {
      key: "upload_media",
      label: "上传素材",
      desc: "cgi-bin/media/upload",
      params: [
        { key: "type", label: "素材类型", required: true, placeholder: "image / voice / video / file" },
        { key: "media", label: "文件路径/流", required: true, placeholder: "${input.filePath}" },
      ],
    },
    {
      key: "get_user",
      label: "获取成员",
      desc: "cgi-bin/user/get",
      params: [
        { key: "userid", label: "成员 UserID", required: true, placeholder: "${input.userId}" },
      ],
    },
  ],
  webhook: [
    {
      key: "post_json",
      label: "POST JSON",
      desc: "以 application/json 发送请求",
      params: [
        { key: "body", label: "请求体", required: true, placeholder: "${input.payload}", hint: "JSON 字符串或模板变量" },
        { key: "headers", label: "附加请求头", placeholder: "X-Trace-Id: ${input.traceId}" },
      ],
    },
    {
      key: "post_form",
      label: "POST FORM",
      desc: "以 x-www-form-urlencoded 发送",
      params: [
        { key: "fields", label: "字段", required: true, placeholder: "key1=${input.a}&key2=${input.b}" },
      ],
    },
  ],
};

const TYPE_LABEL: Record<ConnectorType, string> = {
  feishu: "飞书",
  dingtalk: "钉钉",
  wecom: "企业微信",
  webhook: "Webhook",
};

export function ConnectorBindingEditor({
  value,
  onChange,
}: {
  value: ConnectorBinding | undefined;
  onChange: (v: ConnectorBinding | undefined) => void;
}) {
  const connectors = useStore(connectorsStore);
  const enabledConnectors = useMemo(
    () => connectors.filter((c) => c.enabled),
    [connectors],
  );
  const selected: Connector | undefined = value
    ? connectors.find((c) => c.id === value.connectorId)
    : undefined;
  const actions = selected ? CONNECTOR_ACTIONS[selected.type] : [];
  const action = value ? actions.find((a) => a.key === value.action) : undefined;

  function pickConnector(id: string) {
    const c = connectors.find((x) => x.id === id);
    if (!c) return;
    const first = CONNECTOR_ACTIONS[c.type][0];
    onChange({
      connectorId: id,
      action: first?.key ?? "",
      paramMap: {},
    });
  }

  function pickAction(key: string) {
    if (!value) return;
    onChange({ ...value, action: key, paramMap: {} });
  }

  function setParam(k: string, v: string) {
    if (!value) return;
    const next = { ...value.paramMap };
    if (v) next[k] = v;
    else delete next[k];
    onChange({ ...value, paramMap: next });
  }

  const missing = action?.params.filter(
    (p) => p.required && !value?.paramMap[p.key]?.trim(),
  ) ?? [];

  return (
    <div className="rounded-lg border border-border/80 bg-surface p-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-3.5 w-3.5 text-brand" />
        <span className="text-xs font-medium text-foreground">连接器绑定</span>
        <Badge variant="outline" className="border-border text-[10px] font-normal text-muted-foreground">
          可选
        </Badge>
        {value && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 gap-1 px-2 text-[11px] text-muted-foreground"
            onClick={() => onChange(undefined)}
          >
            <X className="h-3 w-3" /> 移除绑定
          </Button>
        )}
      </div>

      {enabledConnectors.length === 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-dashed border-border/70 bg-background p-3 text-[12px] text-muted-foreground">
          <Plug className="mt-0.5 h-3.5 w-3.5 text-brand" />
          <div className="flex-1">
            尚未启用任何连接器。请先到「连接器」页面新增并启用飞书 / 钉钉 / 企业微信 / Webhook 配置。
          </div>
          <Link
            to="/connectors"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
          >
            前往 <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-[11px] text-muted-foreground">选择连接器</Label>
            <Select
              value={value?.connectorId ?? ""}
              onValueChange={(v) => pickConnector(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="未绑定 · 使用工具/技能自身逻辑" />
              </SelectTrigger>
              <SelectContent>
                {enabledConnectors.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="mr-2 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {TYPE_LABEL[c.type]}
                    </span>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldHint>调用时将凭据与 base URL 从连接器读取，参数按下方映射拼装。</FieldHint>
          </div>

          {selected && (
            <div className="grid gap-1.5">
              <Label className="text-[11px] text-muted-foreground">动作</Label>
              <Select value={value?.action ?? ""} onValueChange={pickAction}>
                <SelectTrigger>
                  <SelectValue placeholder="选择动作" />
                </SelectTrigger>
                <SelectContent>
                  {actions.map((a) => (
                    <SelectItem key={a.key} value={a.key}>
                      {a.label}
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        {a.desc}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {action && (
            <div className="grid gap-2 rounded-md border border-border/60 bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-foreground">参数映射</span>
                <span className="text-[10px] text-muted-foreground">
                  支持字面量或 <code className="font-mono">{"${input.xxx}"}</code>
                </span>
              </div>
              {action.params.map((p) => (
                <div key={p.key} className="grid gap-1">
                  <div className="flex items-center gap-1.5">
                    <Label className="font-mono text-[11px]">{p.key}</Label>
                    <span className="text-[10px] text-muted-foreground">· {p.label}</span>
                    {p.required && (
                      <span className="text-[10px] font-medium text-destructive">必填</span>
                    )}
                  </div>
                  <Input
                    className="h-8 font-mono text-[12px]"
                    value={value?.paramMap[p.key] ?? ""}
                    onChange={(e) => setParam(p.key, e.target.value)}
                    placeholder={p.placeholder}
                    aria-invalid={p.required && !value?.paramMap[p.key]?.trim()}
                  />
                  {p.hint && <FieldHint>{p.hint}</FieldHint>}
                </div>
              ))}
              {missing.length > 0 && (
                <div className="mt-1 flex items-start gap-1.5 rounded bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    缺少必填映射：{missing.map((p) => p.key).join("、")}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ConnectorBindingBadge({ binding }: { binding: ConnectorBinding | undefined }) {
  const connectors = useStore(connectorsStore);
  if (!binding) return null;
  const c = connectors.find((x) => x.id === binding.connectorId);
  if (!c) {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 text-[10px] text-destructive">
        <Link2 className="h-3 w-3" /> 连接器已删除
      </Badge>
    );
  }
  const action = CONNECTOR_ACTIONS[c.type].find((a) => a.key === binding.action);
  return (
    <Badge variant="outline" className="gap-1 border-brand/40 bg-brand-soft/40 text-[10px] text-brand">
      <Link2 className="h-3 w-3" />
      {TYPE_LABEL[c.type]} · {action?.label ?? binding.action}
    </Badge>
  );
}
