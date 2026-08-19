import { describe, expect, it } from 'vitest'
import { selectRenderViewId } from '../../vscode-extension/webview/view-selection'

const views = {
  default: { id: 'default', name: 'Default' },
  details: { id: 'details', name: 'Details' },
}

describe('extension preview view selection', () => {
  it('preserves the current view when the same target is refreshed', () => {
    expect(selectRenderViewId(views, undefined, 'details', true)).toBe('details')
  })

  it('returns to the default view for a different target', () => {
    expect(selectRenderViewId(views, undefined, 'details', false)).toBe('default')
  })

  it('honours an explicitly requested view id or name', () => {
    expect(selectRenderViewId(views, 'details', null, false)).toBe('details')
    expect(selectRenderViewId(views, 'Details', null, false)).toBe('details')
  })
})
