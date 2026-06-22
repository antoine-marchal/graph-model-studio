export interface StorageProvider {
  readonly id: string
  readonly label: string
  canOpen(): boolean
  canSave(): boolean
  open(): Promise<{ content: string; name: string } | null>
  /** persist content; resolves to the saved file name, or null if cancelled/failed */
  save(content: string, suggestedName?: string): Promise<string | null>
  saveAs(content: string, suggestedName?: string): Promise<string | null>
}
