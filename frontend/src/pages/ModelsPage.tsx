import { Cpu } from 'lucide-react'
import PlaceholderPage from './PlaceholderPage'

export default function ModelsPage() {
  return (
    <PlaceholderPage
      title="模型管理"
      description="配置模型供应商，管理 baseUrl 与 apiKey"
      icon={<Cpu size={40} />}
    />
  )
}
