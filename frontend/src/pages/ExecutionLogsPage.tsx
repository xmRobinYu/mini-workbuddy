import { ScrollText } from 'lucide-react'
import PlaceholderPage from './PlaceholderPage'

export default function ExecutionLogsPage() {
  return (
    <PlaceholderPage
      title="执行日志"
      description="查看 Agent 执行过程与工具调用记录"
      icon={<ScrollText size={40} />}
    />
  )
}
