import { MessageSquare } from 'lucide-react'
import PlaceholderPage from './PlaceholderPage'

export default function ChatPage() {
  return (
    <PlaceholderPage
      title="聊天"
      description="与 Agent 对话，自然语言驱动任务执行"
      icon={<MessageSquare size={40} />}
    />
  )
}
