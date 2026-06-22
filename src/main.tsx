import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { ExportRunner } from './app/ExportRunner'
import { getExportRequest, type ExportRequest } from './services/tauri'
import './styles/global.css'

function Root() {
  const [mode, setMode] = useState<'loading' | 'app' | { export: ExportRequest }>('loading')

  useEffect(() => {
    getExportRequest().then(req => setMode(req ? { export: req } : 'app'))
  }, [])

  if (mode === 'loading') return null
  if (mode === 'app') return <App />
  return <ExportRunner request={mode.export} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
