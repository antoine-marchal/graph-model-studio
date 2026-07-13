import { beforeEach, describe, expect, it } from 'vitest'
import { loadNodeTypeQuery, NODE_TYPE_QUERY_KEY, saveNodeTypeQuery } from '@/features/editor-graph/NodeTypePicker'

describe('node type picker search persistence', () => {
  beforeEach(() => localStorage.clear())

  it('restores the last search value from localStorage', () => {
    saveNodeTypeQuery('sankey')
    expect(localStorage.getItem(NODE_TYPE_QUERY_KEY)).toBe('sankey')
    expect(loadNodeTypeQuery()).toBe('sankey')
  })
})
