export interface StorageProvider {
  readonly id: string
  readonly label: string
  canOpen(): boolean
  canSave(): boolean
  open(): Promise<{ content: string; name: string } | null>
  save(content: string, suggestedName?: string): Promise<boolean>
  saveAs(content: string, suggestedName?: string): Promise<boolean>
}
