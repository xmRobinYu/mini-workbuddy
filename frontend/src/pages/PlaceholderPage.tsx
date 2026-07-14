import type { ReactNode } from 'react'

// 占位页面通用组件：统一的标题 + 描述样式
interface PlaceholderPageProps {
  title: string
  description: string
  icon?: ReactNode
}

export default function PlaceholderPage({
  title,
  description,
  icon,
}: PlaceholderPageProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b border-warm-border px-6">
        <h1 className="text-base font-semibold text-warm-text">{title}</h1>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          {icon && <div className="mb-3 flex justify-center text-warm-text-muted">{icon}</div>}
          <p className="text-sm text-warm-text-muted">{description}</p>
        </div>
      </div>
    </div>
  )
}
