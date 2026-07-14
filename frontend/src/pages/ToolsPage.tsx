import { Wrench } from 'lucide-react'
import PlaceholderPage from './PlaceholderPage'

export default function ToolsPage() {
  return (
    <PlaceholderPage
      title="工具管理"
      description="管理内置工具的启用与禁用状态"
      icon={<Wrench size={40} />}
    />
  )
}
