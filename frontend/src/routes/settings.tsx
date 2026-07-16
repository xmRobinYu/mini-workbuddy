import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Folder, Shield, Key, Github, Download, Upload, DatabaseBackup, Palette, Paintbrush } from "lucide-react";
import { downloadBackup, restoreFromFile, type RestoreMode } from "@/lib/backup";
import { ThemePicker } from "@/components/theme-picker";
import { AccentPicker } from "@/components/accent-picker";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) setPending(f);
  }

  async function doRestore(mode: RestoreMode) {
    if (!pending) return;
    await restoreFromFile(pending, mode);
    setPending(null);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-5">
      <PageHeader title="设置" subtitle="工作台的全局配置与运行环境。" />

      <div className="mt-5 space-y-4">
        <Section icon={Palette} title="外观主题" desc="切换浅色 / 深色，或跟随系统偏好。选择会保存在本设备。">
          <ThemePicker />
        </Section>

        <Section icon={Paintbrush} title="强调色 / 品牌色" desc="选择预设或输入自定义 HEX，设定会写入全局设计令牌，全站按钮、链接、焦点环与侧边栏高亮同步生效。">
          <AccentPicker />
        </Section>

        <Section icon={DatabaseBackup} title="备份与恢复" desc="将模型 / 工具 / Skills / Agent 配置一键导出为 JSON，或从文件恢复。">
          <div className="flex flex-wrap gap-2">
            <Button onClick={downloadBackup} className="gap-2">
              <Download className="h-4 w-4" /> 导出为 JSON
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" /> 从文件恢复
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onPickFile}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            备份文件包含模型 / 工具 / Skills / Agent 的完整配置，可跨设备迁移。
          </p>
        </Section>


        <Section icon={Folder} title="Workspace 目录" desc="所有会话、记忆、Skills 与产出文件的存储位置。">
          <div className="grid gap-2">
            <Label htmlFor="ws">目录路径</Label>
            <div className="flex gap-2">
              <Input id="ws" defaultValue="/Users/dev/mini-workbuddy/workspace" className="font-mono" />
              <Button variant="outline">浏览...</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">切换后需要重启工作台。</p>
          </div>
        </Section>

        <Section icon={Shield} title="安全" desc="密钥保护、命令沙箱、路径校验（P0），Bearer Token 认证（P1）。">
          <Row label="启用命令沙箱" desc="run_command 仅执行白名单命令" defaultChecked />
          <Row label="路径越权校验" desc="限制读写在 workspace 目录内" defaultChecked />
          <Row label="Bearer Token 认证" desc="P1 · 对外暴露 API 时启用" />
        </Section>

        <Section icon={Key} title="API 密钥存储" desc="密钥仅存储在本地，不会随会话或日志外泄。">
          <div className="rounded-lg bg-surface p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">存储位置</span>
              <code className="font-mono text-[12px]">workspace/.secrets.enc</code>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted-foreground">加密方式</span>
              <code className="font-mono text-[12px]">AES-256-GCM</code>
            </div>
          </div>
        </Section>

        <Section icon={Github} title="源代码" desc="项目采用 MIT 协议。">
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2">
              <Github className="h-4 w-4" /> 查看仓库
            </Button>
            <Button variant="ghost">更新日志</Button>
          </div>
        </Section>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>如何恢复这份备份？</AlertDialogTitle>
            <AlertDialogDescription>
              文件：<span className="font-mono">{pending?.name}</span>
              <br />
              选择「替换」将丢弃当前的模型 / 工具 / Skills / Agent 配置；选择「合并」会按 ID 合并，同 ID 以备份为准。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => doRestore("merge")}>合并导入</AlertDialogAction>
            <AlertDialogAction onClick={() => doRestore("replace")}>替换全部</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-warm p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, desc, defaultChecked }: { label: string; desc: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-surface px-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}
