import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { GraphModel, GraphElement, GraphRelation, Position } from '@/core/model'
import { createEmptyModel } from '@/core/model'
import type { ModelCommand } from '@/core/model/commands'
import type { Diagnostic } from '@/core/model'
import { parseDsl } from '@/core/dsl/parser'
import { serializeModel } from '@/core/dsl/serializer'
import type { LayoutEngine } from '@/core/layout'
import { getVisibleElementIds, isRelationIncluded, relationKey } from '@/core/model/view-visibility'

export type Theme = 'light' | 'dark'
export type EdgeRouting = 'curved' | 'orthogonal'

interface HistorySnapshot {
  model: GraphModel
  dslSource: string
  activeViewId: string | null
}
const HISTORY_LIMIT = 100

export interface HighlightRequest {
  kind: 'element' | 'relation'
  id: string
  nonce: number
  /** focus the code editor (true for double-click jumps, false for plain selection) */
  focus: boolean
}

export interface ModelStore {
  model: GraphModel
  dslSource: string
  activeViewId: string | null
  selectedElementIds: string[]
  /** convenience: the primary (last) selected element id, kept in sync with selectedElementIds */
  selectedElementId: string | null
  selectedRelationId: string | null
  isDirty: boolean
  fileName: string | null
  diagnostics: Diagnostic[]
  parseError: boolean
  theme: Theme
  highlightRequest: HighlightRequest | null
  focusPropertiesNonce: number
  /** id of the element currently being renamed inline on the canvas */
  editingElementId: string | null
  layoutEngine: LayoutEngine
  snapToGrid: boolean
  showMinimap: boolean
  edgeRouting: EdgeRouting
  /** most-recently-used element types for the quick-add menu */
  recentTypes: string[]
  past: HistorySnapshot[]
  future: HistorySnapshot[]

  dispatch(command: ModelCommand): void
  undo(): void
  redo(): void
  setEditingElement(id: string | null): void
  setLayoutEngine(engine: LayoutEngine): void
  toggleSnapToGrid(): void
  toggleMinimap(): void
  toggleEdgeRouting(): void
  pushRecentType(type: string): void
  duplicateElements(ids: string[]): string[]
  setDslSource(source: string): void
  parseDslAndUpdate(source: string): void
  setActiveView(viewId: string): void
  selectElements(ids: string[]): void
  selectElement(id: string | null, opts?: { additive?: boolean }): void
  selectRelation(id: string | null): void
  loadModel(model: GraphModel, dsl?: string): void
  newModel(): void
  setFileName(name: string | null): void
  setDirty(dirty: boolean): void
  regenerateDsl(): void
  setTheme(theme: Theme): void
  toggleTheme(): void
  requestHighlight(kind: 'element' | 'relation', id: string, opts?: { focus?: boolean }): void
  requestFocusProperties(): void
  setViewPositions(viewId: string, positions: Record<string, Position>, merge?: boolean): void
  createView(): string
  deleteView(viewId: string): void
  renameView(viewId: string, name: string): void
  addElementsToView(viewId: string, ids: string[]): void
  removeElementFromView(viewId: string, id: string): void
  /** show/hide a single element in a view (materialises an "include all" view first) */
  toggleElementInView(viewId: string, id: string): void
  /** show/hide a single relation in a view */
  toggleRelationInView(viewId: string, relationId: string): void
  /** include the given relations in a view (drag-and-drop) */
  addRelationsToView(viewId: string, relationIds: string[]): void
}

const EXAMPLE_DSL = `model {
  customer = person "Customer" {
    description "A user of the banking application"
  }

  banking = softwareSystem "Banking Platform" {
    web = container "Web Application" {
      technology "React"
    }
    api = container "API Gateway" {
      technology "Node.js"
    }
    db = container "PostgreSQL Database" {
      technology "PostgreSQL"
    }
  }

  customer -> banking.web "Uses"
  banking.web -> banking.api "Calls"
  banking.api -> banking.db "Reads / writes"
}

views {
  view systemContext {
    include *
    autolayout lr
  }
}`

const DRAFT_KEY = 'gms:draft'
const THEME_KEY = 'gms:theme'
const PREFS_KEY = 'gms:prefs'

function loadDraft(): string | null {
  try { return localStorage.getItem(DRAFT_KEY) } catch { return null }
}
function saveDraft(dsl: string) {
  try { localStorage.setItem(DRAFT_KEY, dsl) } catch { /* ignore */ }
}
function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY)
    if (t === 'light' || t === 'dark') return t
  } catch { /* ignore */ }
  return 'dark'
}

interface Prefs {
  layoutEngine: LayoutEngine
  snapToGrid: boolean
  showMinimap: boolean
  edgeRouting: EdgeRouting
  recentTypes: string[]
}
function loadPrefs(): Prefs {
  const fallback: Prefs = { layoutEngine: 'layered', snapToGrid: false, showMinimap: true, edgeRouting: 'orthogonal', recentTypes: [] }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as Partial<Prefs>) }
  } catch { return fallback }
}
function savePrefs(p: Prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)) } catch { /* ignore */ }
}

function ensureDefaultView(model: GraphModel) {
  if (Object.keys(model.views).length === 0) {
    model.views['default'] = {
      id: 'default', name: 'Default View', type: 'default',
      includedElements: [], includedRelations: [], includeAll: true, includeAllRelations: true,
      layoutMode: 'auto', layoutDirection: 'tb', filters: [], styleOverrides: {}, layoutPositions: {}, nodeSizes: {},
    }
  }
}

/** Preserve visual-only state across a re-parse (the DSL stores none of it):
 *  view positions, manual node sizes, and pinned edge anchors. */
function carryOverPositions(oldModel: GraphModel, newModel: GraphModel) {
  for (const [viewId, oldView] of Object.entries(oldModel.views)) {
    const newView = newModel.views[viewId]
    if (!newView) continue
    const carried: Record<string, Position> = {}
    for (const [elId, pos] of Object.entries(oldView.layoutPositions ?? {})) {
      if (newModel.elements[elId]) carried[elId] = pos
    }
    newView.layoutPositions = carried
    // per-view manual node sizes
    const carriedSizes: Record<string, { width: number; height: number }> = {}
    for (const [elId, sz] of Object.entries(oldView.nodeSizes ?? {})) {
      if (newModel.elements[elId]) carriedSizes[elId] = sz
    }
    newView.nodeSizes = carriedSizes
  }
  // pinned edge anchors (matched by endpoints + type, since ids regenerate on parse)
  const keyOf = (r: { sourceId: string; targetId: string; type: string }) => `${r.sourceId}->${r.targetId}:${r.type}`
  const oldByKey = new Map<string, GraphRelation>()
  for (const r of Object.values(oldModel.relations)) {
    if (r.sourceHandle || r.targetHandle || r.direction !== 'directed') oldByKey.set(keyOf(r), r)
  }
  for (const r of Object.values(newModel.relations)) {
    const prev = oldByKey.get(keyOf(r))
    if (prev) { r.sourceHandle = prev.sourceHandle; r.targetHandle = prev.targetHandle; r.direction = prev.direction }
  }
}

function isDslAffecting(cmd: ModelCommand): boolean {
  return cmd.type !== 'APPLY_LAYOUT'
}

function applyCommand(model: GraphModel, command: ModelCommand, activeViewId: string | null): GraphModel {
  switch (command.type) {
    case 'ADD_ELEMENT': {
      const el: GraphElement = { tags: [], properties: {}, children: [], ...command.payload }
      const { position } = el
      delete (el as Partial<GraphElement>).position
      model.elements[el.id] = el
      if (el.parentId && model.elements[el.parentId]) {
        if (!model.elements[el.parentId].children.includes(el.id)) {
          model.elements[el.parentId].children.push(el.id)
        }
      }
      if (position && activeViewId && model.views[activeViewId]) {
        model.views[activeViewId].layoutPositions[el.id] = position
      }
      break
    }
    case 'UPDATE_ELEMENT': {
      const existing = model.elements[command.payload.id]
      if (existing) {
        const reparented = 'parentId' in command.payload && command.payload.parentId !== existing.parentId
        const oldParent = existing.parentId
        Object.assign(existing, command.payload)
        if (reparented) {
          // maintain children arrays
          if (oldParent && model.elements[oldParent]) {
            model.elements[oldParent].children = model.elements[oldParent].children.filter(c => c !== existing.id)
          }
          const np = existing.parentId
          if (np && model.elements[np] && !model.elements[np].children.includes(existing.id)) {
            model.elements[np].children.push(existing.id)
          }
          // drop stale positions so the moved node is re-laid-out inside its new parent
          for (const view of Object.values(model.views)) delete view.layoutPositions[existing.id]
        }
      }
      break
    }
    case 'DELETE_ELEMENT': {
      const el = model.elements[command.payload.id]
      if (el?.parentId) {
        const parent = model.elements[el.parentId]
        if (parent) parent.children = parent.children.filter(id => id !== command.payload.id)
      }
      // reparent children to grandparent
      if (el) {
        for (const childId of el.children) {
          const child = model.elements[childId]
          if (child) child.parentId = el.parentId
        }
      }
      delete model.elements[command.payload.id]
      for (const [id, rel] of Object.entries(model.relations)) {
        if (rel.sourceId === command.payload.id || rel.targetId === command.payload.id) {
          delete model.relations[id]
        }
      }
      for (const view of Object.values(model.views)) {
        delete view.layoutPositions[command.payload.id]
        view.includedElements = view.includedElements.filter(i => i !== command.payload.id)
      }
      break
    }
    case 'ADD_RELATION': {
      const rel: GraphRelation = {
        type: 'rel', direction: 'directed', tags: [], properties: {}, ...command.payload,
      }
      model.relations[rel.id] = rel
      break
    }
    case 'UPDATE_RELATION': {
      const existing = model.relations[command.payload.id]
      if (existing) Object.assign(existing, command.payload)
      break
    }
    case 'DELETE_RELATION': {
      delete model.relations[command.payload.id]
      break
    }
    case 'ADD_VIEW': {
      model.views[command.payload.id] = command.payload
      break
    }
    case 'UPDATE_VIEW': {
      const existing = model.views[command.payload.id]
      if (existing) Object.assign(existing, command.payload)
      break
    }
    case 'DELETE_VIEW': {
      delete model.views[command.payload.id]
      break
    }
    case 'APPLY_LAYOUT': {
      const view = model.views[command.payload.viewId]
      if (view) {
        for (const [id, pos] of Object.entries(command.payload.positions)) {
          view.layoutPositions[id] = pos
        }
      }
      break
    }
    case 'SET_NODE_SIZE': {
      const view = model.views[command.payload.viewId]
      if (view) {
        if (!view.nodeSizes) view.nodeSizes = {}
        view.nodeSizes[command.payload.id] = command.payload.size
      }
      break
    }
    case 'REPLACE_MODEL': {
      return command.payload
    }
  }
  return model
}

export const useModelStore = create<ModelStore>()(
  immer((set, get) => {
    const draft = loadDraft()
    const initialSource = draft ?? EXAMPLE_DSL
    const initialParse = parseDsl(initialSource)
    const initialModel = initialParse.model ?? createEmptyModel()
    ensureDefaultView(initialModel)
    const prefs = loadPrefs()

    const persistPrefs = () => {
      const s = get()
      savePrefs({ layoutEngine: s.layoutEngine, snapToGrid: s.snapToGrid, showMinimap: s.showMinimap, edgeRouting: s.edgeRouting, recentTypes: s.recentTypes })
    }

    return {
      model: initialModel,
      dslSource: initialSource,
      activeViewId: Object.keys(initialModel.views)[0] ?? null,
      selectedElementIds: [],
      selectedElementId: null,
      selectedRelationId: null,
      isDirty: false,
      fileName: null,
      diagnostics: initialParse.diagnostics,
      parseError: !initialParse.success,
      theme: loadTheme(),
      highlightRequest: null,
      focusPropertiesNonce: 0,
      editingElementId: null,
      layoutEngine: prefs.layoutEngine,
      snapToGrid: prefs.snapToGrid,
      showMinimap: prefs.showMinimap,
      edgeRouting: prefs.edgeRouting,
      recentTypes: prefs.recentTypes,
      past: [],
      future: [],

      dispatch(command) {
        set(state => {
          // snapshot for undo (skip pure layout nudges to avoid flooding history)
          if (command.type !== 'APPLY_LAYOUT') {
            state.past.push({ model: state.model, dslSource: state.dslSource, activeViewId: state.activeViewId })
            if (state.past.length > HISTORY_LIMIT) state.past.shift()
            state.future = []
          }
          const activeViewId = state.activeViewId
          if (command.type === 'REPLACE_MODEL') {
            state.model = command.payload
          } else {
            applyCommand(state.model, command, activeViewId)
          }
          state.isDirty = true
          state.model.metadata.updatedAt = new Date().toISOString()
          if (isDslAffecting(command)) {
            state.dslSource = serializeModel(state.model)
            saveDraft(state.dslSource)
          }
        })
      },

      undo() {
        set(state => {
          const prev = state.past.pop()
          if (!prev) return
          state.future.push({ model: state.model, dslSource: state.dslSource, activeViewId: state.activeViewId })
          state.model = prev.model
          state.dslSource = prev.dslSource
          state.activeViewId = prev.activeViewId
          state.isDirty = true
          state.parseError = false
          state.diagnostics = []
          state.selectedElementIds = state.selectedElementIds.filter(id => prev.model.elements[id])
          state.selectedElementId = state.selectedElementIds.at(-1) ?? null
          if (state.selectedRelationId && !prev.model.relations[state.selectedRelationId]) state.selectedRelationId = null
          saveDraft(state.dslSource)
        })
      },

      redo() {
        set(state => {
          const next = state.future.pop()
          if (!next) return
          state.past.push({ model: state.model, dslSource: state.dslSource, activeViewId: state.activeViewId })
          state.model = next.model
          state.dslSource = next.dslSource
          state.activeViewId = next.activeViewId
          state.isDirty = true
          saveDraft(state.dslSource)
        })
      },

      setEditingElement(id) { set(state => { state.editingElementId = id }) },

      setLayoutEngine(engine) { set(state => { state.layoutEngine = engine }); persistPrefs() },
      toggleSnapToGrid() { set(state => { state.snapToGrid = !state.snapToGrid }); persistPrefs() },
      toggleMinimap() { set(state => { state.showMinimap = !state.showMinimap }); persistPrefs() },
      toggleEdgeRouting() { set(state => { state.edgeRouting = state.edgeRouting === 'curved' ? 'orthogonal' : 'curved' }); persistPrefs() },
      pushRecentType(type) {
        set(state => { state.recentTypes = [type, ...state.recentTypes.filter(t => t !== type)].slice(0, 8) })
        persistPrefs()
      },

      duplicateElements(ids) {
        const newIds: string[] = []
        set(state => {
          state.past.push({ model: state.model, dslSource: state.dslSource, activeViewId: state.activeViewId })
          state.future = []
          const view = state.activeViewId ? state.model.views[state.activeViewId] : undefined
          const idMap = new Map<string, string>()
          for (const id of ids) {
            const el = state.model.elements[id]
            if (!el) continue
            const suffix = Math.random().toString(36).slice(2, 6)
            const nid = `${el.type}_${suffix}`
            idMap.set(id, nid)
            newIds.push(nid)
            state.model.elements[nid] = {
              ...el, id: nid, children: [],
              parentId: el.parentId && idMap.has(el.parentId) ? idMap.get(el.parentId) : el.parentId,
            }
            if (view) {
              const p = view.layoutPositions[id]
              view.layoutPositions[nid] = p ? { x: p.x + 32, y: p.y + 32 } : { x: 60, y: 60 }
            }
          }
          // copy relations whose endpoints were both duplicated
          for (const rel of Object.values(state.model.relations)) {
            if (idMap.has(rel.sourceId) && idMap.has(rel.targetId)) {
              const rid = `rel_${idMap.get(rel.sourceId)}_${idMap.get(rel.targetId)}_${Math.random().toString(36).slice(2, 6)}`
              state.model.relations[rid] = { ...rel, id: rid, sourceId: idMap.get(rel.sourceId)!, targetId: idMap.get(rel.targetId)! }
            }
          }
          state.isDirty = true
          state.dslSource = serializeModel(state.model)
          saveDraft(state.dslSource)
        })
        return newIds
      },

      setDslSource(source) {
        set(state => { state.dslSource = source })
      },

      parseDslAndUpdate(source) {
        const result = parseDsl(source)
        set(state => {
          state.dslSource = source
          state.diagnostics = result.diagnostics
          state.parseError = !result.success
          if (result.model) {
            ensureDefaultView(result.model)
            carryOverPositions(state.model, result.model)
            state.model = result.model
            state.isDirty = true
            if (!state.activeViewId || !result.model.views[state.activeViewId]) {
              state.activeViewId = Object.keys(result.model.views)[0] ?? null
            }
            // drop selections that no longer exist
            state.selectedElementIds = state.selectedElementIds.filter(id => result.model!.elements[id])
            state.selectedElementId = state.selectedElementIds.length
              ? state.selectedElementIds[state.selectedElementIds.length - 1] : null
            if (state.selectedRelationId && !result.model.relations[state.selectedRelationId]) {
              state.selectedRelationId = null
            }
          }
          saveDraft(source)
        })
      },

      setActiveView(viewId) {
        set(state => {
          state.activeViewId = viewId
          state.selectedElementIds = []
          state.selectedElementId = null
          state.selectedRelationId = null
        })
      },

      selectElements(ids) {
        set(state => {
          state.selectedElementIds = ids
          state.selectedElementId = ids.length ? ids[ids.length - 1] : null
          if (ids.length) state.selectedRelationId = null
        })
      },

      selectElement(id, opts) {
        set(state => {
          if (id === null) { state.selectedElementIds = []; state.selectedElementId = null; return }
          if (opts?.additive) {
            state.selectedElementIds = state.selectedElementIds.includes(id)
              ? state.selectedElementIds.filter(x => x !== id)
              : [...state.selectedElementIds, id]
          } else {
            state.selectedElementIds = [id]
          }
          state.selectedElementId = state.selectedElementIds.length
            ? state.selectedElementIds[state.selectedElementIds.length - 1]
            : null
          state.selectedRelationId = null
        })
      },

      selectRelation(id) {
        set(state => {
          state.selectedRelationId = id
          if (id) { state.selectedElementIds = []; state.selectedElementId = null }
        })
      },

      loadModel(model, dsl) {
        ensureDefaultView(model)
        set(state => {
          state.model = model
          state.dslSource = dsl ?? serializeModel(model)
          state.isDirty = false
          state.activeViewId = Object.keys(model.views)[0] ?? null
          state.selectedElementIds = []
          state.selectedElementId = null
          state.selectedRelationId = null
          state.diagnostics = []
          state.parseError = false
          state.past = []
          state.future = []
          saveDraft(state.dslSource)
        })
      },

      newModel() {
        const empty = createEmptyModel()
        ensureDefaultView(empty)
        set(state => {
          state.model = empty
          state.dslSource = serializeModel(empty)
          state.isDirty = false
          state.fileName = null
          state.activeViewId = 'default'
          state.selectedElementIds = []
          state.selectedElementId = null
          state.selectedRelationId = null
          state.diagnostics = []
          state.parseError = false
          state.past = []
          state.future = []
          saveDraft(state.dslSource)
        })
      },

      setFileName(name) { set(state => { state.fileName = name }) },
      setDirty(dirty) { set(state => { state.isDirty = dirty }) },
      regenerateDsl() {
        set(state => {
          state.dslSource = serializeModel(state.model)
          saveDraft(state.dslSource)
        })
      },

      setTheme(theme) {
        set(state => { state.theme = theme })
        try { localStorage.setItem(THEME_KEY, theme) } catch { /* ignore */ }
      },
      toggleTheme() {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
        get().setTheme(next)
      },

      requestHighlight(kind, id, opts) {
        set(state => { state.highlightRequest = { kind, id, nonce: Date.now(), focus: !!opts?.focus } })
      },
      requestFocusProperties() {
        set(state => { state.focusPropertiesNonce = Date.now() })
      },

      setViewPositions(viewId, positions, merge = true) {
        set(state => {
          const view = state.model.views[viewId]
          if (!view) return
          view.layoutPositions = merge ? { ...view.layoutPositions, ...positions } : positions
          // reflect the new layout in the DSL/draft so it round-trips on save
          state.isDirty = true
          state.dslSource = serializeModel(state.model)
          saveDraft(state.dslSource)
        })
      },

      createView() {
        const id = `view_${Math.random().toString(36).slice(2, 7)}`
        set(state => {
          const n = Object.keys(state.model.views).length + 1
          // start empty: the user drags elements from the Explorer to populate it
          state.model.views[id] = {
            id, name: `View ${n}`, type: 'default',
            includedElements: [], includedRelations: [], includeAll: false, includeAllRelations: true,
            layoutMode: 'auto', layoutDirection: 'tb', filters: [], styleOverrides: {}, layoutPositions: {}, nodeSizes: {},
          }
          state.activeViewId = id
          state.isDirty = true
          state.dslSource = serializeModel(state.model)
          saveDraft(state.dslSource)
        })
        return id
      },

      addElementsToView(viewId, ids) {
        set(state => {
          const v = state.model.views[viewId]
          if (!v) return
          v.includeAll = false
          for (const id of ids) {
            if (state.model.elements[id] && !v.includedElements.includes(id)) v.includedElements.push(id)
          }
          state.isDirty = true
          state.dslSource = serializeModel(state.model)
          saveDraft(state.dslSource)
        })
      },

      removeElementFromView(viewId, id) {
        set(state => {
          const v = state.model.views[viewId]
          if (!v) return
          v.includedElements = v.includedElements.filter(e => e !== id)
          delete v.layoutPositions[id]
          state.isDirty = true
          state.dslSource = serializeModel(state.model)
          saveDraft(state.dslSource)
        })
      },

      toggleElementInView(viewId, id) {
        set(state => {
          const v = state.model.views[viewId]
          if (!v) return
          const visible = getVisibleElementIds(state.model, v)
          const willShow = !visible.has(id)
          // materialise to an explicit element list so a single toggle is unambiguous
          const base = new Set(visible)
          if (willShow) base.add(id)
          else { base.delete(id); delete v.layoutPositions[id]; delete v.nodeSizes[id] }
          v.includeAll = false
          v.includedElements = [...base]
          state.isDirty = true
          state.dslSource = serializeModel(state.model)
          saveDraft(state.dslSource)
        })
      },

      toggleRelationInView(viewId, relationId) {
        set(state => {
          const v = state.model.views[viewId]
          const rel = state.model.relations[relationId]
          if (!v || !rel) return
          const showing = isRelationIncluded(v, rel.sourceId, rel.targetId)
          // materialise the currently-visible relation keys, then flip this one
          const base = new Set(
            v.includeAllRelations !== false
              ? Object.values(state.model.relations).map(r => relationKey(r.sourceId, r.targetId))
              : (v.includedRelations ?? []),
          )
          const key = relationKey(rel.sourceId, rel.targetId)
          if (showing) base.delete(key)
          else base.add(key)
          v.includeAllRelations = false
          v.includedRelations = [...base]
          state.isDirty = true
          state.dslSource = serializeModel(state.model)
          saveDraft(state.dslSource)
        })
      },

      addRelationsToView(viewId, relationIds) {
        set(state => {
          const v = state.model.views[viewId]
          if (!v) return
          const base = new Set(
            v.includeAllRelations !== false
              ? Object.values(state.model.relations).map(r => relationKey(r.sourceId, r.targetId))
              : (v.includedRelations ?? []),
          )
          for (const rid of relationIds) {
            const rel = state.model.relations[rid]
            if (rel) base.add(relationKey(rel.sourceId, rel.targetId))
          }
          v.includeAllRelations = false
          v.includedRelations = [...base]
          state.isDirty = true
          state.dslSource = serializeModel(state.model)
          saveDraft(state.dslSource)
        })
      },

      deleteView(viewId) {
        set(state => {
          if (Object.keys(state.model.views).length <= 1) return
          delete state.model.views[viewId]
          if (state.activeViewId === viewId) {
            state.activeViewId = Object.keys(state.model.views)[0] ?? null
          }
          state.isDirty = true
          state.dslSource = serializeModel(state.model)
          saveDraft(state.dslSource)
        })
      },

      renameView(viewId, name) {
        set(state => {
          const v = state.model.views[viewId]
          if (!v) return
          v.name = name
          state.isDirty = true
          state.dslSource = serializeModel(state.model)
          saveDraft(state.dslSource)
        })
      },
    }
  }),
)
