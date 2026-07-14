import { Bot } from 'lucide-react'
import PlaceholderPage from './PlaceholderPage'

export default function AgentsPage() {
  return (
    <PlaceholderPage
      title="Agent 管理"
      description="管理 Agent，配置系统提示词、工具和技能"
      icon={<Bot size={40} />}
    />
  )
}
