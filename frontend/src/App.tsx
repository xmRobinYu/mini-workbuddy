import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ChatPage from './pages/ChatPage'
import AgentsPage from './pages/AgentsPage'
import ModelsPage from './pages/ModelsPage'
import ToolsPage from './pages/ToolsPage'
import SkillsPage from './pages/SkillsPage'
import ExecutionLogsPage from './pages/ExecutionLogsPage'
import ModelLogsPage from './pages/ModelLogsPage'

// 路由配置：默认重定向到聊天页
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/execution-logs" element={<ExecutionLogsPage />} />
        <Route path="/model-logs" element={<ModelLogsPage />} />
      </Route>
    </Routes>
  )
}
