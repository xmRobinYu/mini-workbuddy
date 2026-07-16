import { Link, useRouterState } from "@tanstack/react-router";
import {
  MessageSquare,
  Boxes,
  Cpu,
  Wrench,
  Layers,
  ScrollText,
  Archive,
  Settings,
  History,
  Palette,
  Plug,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useConnectorHealth } from "@/lib/connector-health";
import { useStore } from "@/lib/mock-store";
import { connectorsStore } from "@/lib/mock-store";

const workspace = [
  { title: "对话", url: "/", icon: MessageSquare },
  { title: "Agent", url: "/agents", icon: Boxes },
  { title: "模型", url: "/models", icon: Cpu },
  { title: "工具", url: "/tools", icon: Wrench },
  { title: "Skills", url: "/skills", icon: Layers },
  { title: "连接器", url: "/connectors", icon: Plug },
];


const insight = [
  { title: "记忆", url: "/memory", icon: Archive },
  { title: "历史", url: "/history", icon: History },
  { title: "日志", url: "/logs", icon: ScrollText },
  { title: "Tokens", url: "/tokens", icon: Palette },
  { title: "设置", url: "/settings", icon: Settings },
];


export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (u: string) => (u === "/" ? pathname === "/" : pathname.startsWith(u));
  const health = useConnectorHealth();
  const connectors = useStore(connectorsStore);
  const failCount = connectors.filter(
    (c) => c.enabled && (health.records[c.id]?.state === "error" || health.records[c.id]?.state === "warn"),
  ).length;


  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-sm">
            <span className="font-display text-lg font-semibold">M</span>
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-[15px] font-semibold text-foreground">
              Mini-WorkBuddy
            </span>
            <span className="text-[11px] text-muted-foreground">工作流控制台 · v1.1</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>工作台</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspace.map((i) => {
                const showDot = i.url === "/connectors" && failCount > 0;
                return (
                  <SidebarMenuItem key={i.url}>
                    <SidebarMenuButton asChild isActive={isActive(i.url)} tooltip={showDot ? `${i.title} · ${failCount} 个异常` : i.title}>
                      <Link to={i.url}>
                        <span className="relative flex items-center">
                          <i.icon />
                          {showDot && (
                            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-sidebar" />
                          )}
                        </span>
                        <span>{i.title}</span>
                        {showDot && (
                          <span className="ml-auto rounded bg-destructive/15 px-1.5 text-[10px] font-medium text-destructive group-data-[collapsible=icon]:hidden">
                            {failCount}
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>洞察</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {insight.map((i) => (
                <SidebarMenuItem key={i.url}>
                  <SidebarMenuButton asChild isActive={isActive(i.url)} tooltip={i.title}>
                    <Link to={i.url}>
                      <i.icon />
                      <span>{i.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-2 group-data-[collapsible=icon]:hidden">
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-foreground">本地运行中</span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
              workspace 目录 · 3 个 Agent · 5 个模型
            </p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
