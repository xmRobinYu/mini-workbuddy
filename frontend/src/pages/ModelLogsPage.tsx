import { FileText } from 'lucide-react'
import PlaceholderPage from './PlaceholderPage'

export default function ModelLogsPage() {
  return (
    <PlaceholderPage
      title="模型日志"
      description="查看模型调用日志与请求详情"
      icon={<FileText size={40} />}
    />
  )
}
