import { NavLink, Outlet } from 'react-router-dom'
import {
  MessageSquare,
  Bot,
  Cpu,
  Wrench,
  Sparkles,
  ScrollText,
  FileText,
} from 'lucide-react'

// 左侧菜单项配置：所有可见文字为简体中文
const menuItems = [
  { to: '/chat', label: '聊天', icon: MessageSquare },
  { to: '/agents', label: 'Agent 管理', icon: Bot },
  { to: '/models', label: '模型管理', icon: Cpu },
  { to: '/tools', label: '工具管理', icon: Wrench },
  { to: '/skills', label: '技能管理', icon: Sparkles },
  { to: '/execution-logs', label: '执行日志', icon: ScrollText },
  { to: '/model-logs', label: '模型日志', icon: FileText },
]

export default function Layout() {
  return (
    <div className="flex h-full">
      {/* 左侧菜单栏 */}
      <aside className="flex w-56 flex-shrink-0 flex-col border-r border-warm-border bg-warm-menu">
        <div className="flex h-14 items-center px-5">
          <span className="text-lg font-semibold text-warm-text">
            Mini-WorkBuddy
          </span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {menuItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-warm px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-warm-orange-light font-medium text-warm-orange'
                    : 'text-warm-text-muted hover:bg-warm-border/50 hover:text-warm-text'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* 右侧内容区 */}
      <main className="flex-1 overflow-auto bg-warm-bg">
        <Outlet />
      </main>
    </div>
  )
}
