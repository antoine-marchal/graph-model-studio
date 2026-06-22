import { useState } from 'react'
import { useModelStore } from '@/store'
import { exporters } from '@/core/export'
import { Button } from '@/ui/components/Button'
import { saveTextFile, filtersForExt } from '@/services/file-save'

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const model = useModelStore(s => s.model)
  const activeViewId = useModelStore(s => s.activeViewId)
  const [loading, setLoading] = useState<string | null>(null)
  const activeView = activeViewId ? model.views[activeViewId] : undefined

  const handleExport = async (exporterId: string) => {
    const exporter = exporters.find(e => e.id === exporterId)
    if (!exporter) return
    setLoading(exporterId)
    try {
      const result = await exporter.export(model, activeView)
      const text = result instanceof Blob ? await result.text() : result
      const baseName = model.metadata.title.replace(/\s+/g, '-').toLowerCase() || 'model'
      const ext = exporter.extension.replace(/^\./, '')
      await saveTextFile(text, { defaultName: `${baseName}${exporter.extension}`, filters: filtersForExt(ext) })
    } finally {
      setLoading(null)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-80 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--fg)]">Export Model</span>
          <button onClick={onClose} className="text-[var(--fg-subtle)] hover:text-[var(--fg)]">✕</button>
        </div>
        <div className="flex flex-col gap-2 p-4">
          {exporters.map(exp => (
            <Button
              key={exp.id}
              variant="outline"
              className="w-full justify-start"
              disabled={loading === exp.id}
              onClick={() => handleExport(exp.id)}
            >
              <span className="mr-2 font-mono text-xs text-[var(--fg-subtle)]">{exp.extension}</span>
              {exp.label}
              {loading === exp.id && <span className="ml-auto text-xs text-[var(--fg-subtle)]">…</span>}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
