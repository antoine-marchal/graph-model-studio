import { describe, it, expect } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { notationRegistry } from '@/core/notation'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import type { GraphModel, GraphView } from '@/core/model'

function view(model: GraphModel): GraphView {
  return Object.values(model.views)[0]
}

function parse(src: string): GraphModel {
  const r = parseDsl(src)
  expect(r.model).toBeTruthy()
  return r.model!
}

describe('chart notations: registry + parsing', () => {
  it('registers sequence, mindmap, gitgraph, ishikawa, quadrant and timeline types', () => {
    for (const t of ['seqGraph', 'participant', 'seqActor', 'mindmapRoot', 'mindmapNode',
      'gitGraph', 'commit', 'mergeCommit', 'problem', 'cause', 'subCause',
      'quadrantChart', 'quadrantItem', 'timelineGraph', 'timelineEvent']) {
      expect(notationRegistry.getElementDef(t), t).toBeTruthy()
    }
    for (const t of ['message', 'asyncMessage', 'replyMessage']) {
      expect(notationRegistry.getRelationDef(t), t).toBeTruthy()
    }
  })

  it('infers the new notations', () => {
    const m = parse(`model {
      p = participant "API"
      r = mindmapRoot "Idea"
      c = commit "c1"
      f = problem "Defects"
      q = quadrantItem "A"
      t = timelineEvent "Launch"
    }`)
    expect(m.elements['p'].notation).toBe('sequence')
    expect(m.elements['r'].notation).toBe('mindmap')
    expect(m.elements['c'].notation).toBe('gitgraph')
    expect(m.elements['f'].notation).toBe('ishikawa')
    expect(m.elements['q'].notation).toBe('quadrant')
    expect(m.elements['t'].notation).toBe('timeline')
  })
})

describe('sequence graph container', () => {
  const m = parse(`model {
    flow = seqGraph "Login" {
      user = seqActor "User"
      web = participant "Web App"
      api = participant "API"
    }
    user -> web : message "click login"
    web -> api : asyncMessage "POST /auth"
    api -> web : replyMessage "200 OK"
  }
  views { view seq "Login flow" { include * autolayout lr } }`)

  it('hosts participants in the frame and draws lifelines + ordered messages', () => {
    const { nodes, edges } = modelToFlow(m, view(m))
    const frame = nodes.find(n => n.id === 'flow')!
    expect(frame.data.chartFrame).toBeTruthy()
    // one dashed lifeline per participant
    expect(frame.data.chartFrame!.lines).toHaveLength(3)
    // participants are React Flow children of the frame → move with it
    for (const id of ['user', 'web', 'api']) {
      expect(nodes.find(n => n.id === id)!.parentId).toBe('flow')
    }
    // heads bottom-aligned at the same lifeline start
    const heads = ['user', 'web', 'api'].map(id => { const n = nodes.find(x => x.id === id)!; return n.position.y + n.height! })
    expect(new Set(heads).size).toBe(1)
    // point nodes parented to the frame, message edges keyed by relation id
    const pts = nodes.filter(n => n.type === 'seqPoint')
    expect(pts).toHaveLength(6)
    for (const p of pts) expect(p.parentId).toBe('flow')
    const msgEdges = edges.filter(e => String(e.source).startsWith('__seqpt_'))
    expect(msgEdges).toHaveLength(3)
    for (const e of msgEdges) expect(m.relations[e.id]).toBeTruthy()
    const reply = msgEdges.find(e => m.relations[e.id].type === 'replyMessage')!
    expect(reply.style?.strokeDasharray).toBe('6 4')
  })
})

describe('git graph container', () => {
  it('assigns lanes per branch property and hosts commits in the frame', () => {
    const m = parse(`model {
      hist = gitGraph "History" {
        c1 = commit "init"
        c2 = commit "feat" { branch "feature" }
        c3 = commit "more" { branch "feature" }
        c4 = mergeCommit "merge" { tag "v1.0" }
      }
      c1 -> c2
      c2 -> c3
      c3 -> c4
      c1 -> c4
    }
    views { view g "History" { include * autolayout lr } }`)
    const { nodes, edges } = modelToFlow(m, view(m))
    const cy = (id: string) => { const n = nodes.find(x => x.id === id)!; return n.position.y + n.height! / 2 }
    // same lane for c1/c4 (main), same for c2/c3 (feature)
    expect(cy('c1')).toBe(cy('c4'))
    expect(cy('c2')).toBe(cy('c3'))
    expect(cy('c1')).not.toBe(cy('c2'))
    // strictly increasing x in declaration order
    const xs = ['c1', 'c2', 'c3', 'c4'].map(id => nodes.find(n => n.id === id)!.position.x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
    // commits are children of the frame; tag → badge; parent links stay edges
    for (const id of ['c1', 'c2', 'c3', 'c4']) expect(nodes.find(n => n.id === id)!.parentId).toBe('hist')
    expect(nodes.find(n => n.id === 'c4')!.data.badge).toBe('v1.0')
    expect(edges.filter(e => m.relations[e.id])).toHaveLength(4)
    // frame carries the lane decor + branch labels
    const frame = nodes.find(n => n.id === 'hist')!
    expect(frame.data.chartFrame!.texts.map(t => t.text)).toEqual(expect.arrayContaining(['main', 'feature']))
  })
})

describe('ishikawa layout (nested containers)', () => {
  const m = parse(`model {
    defects = problem "Too many defects" {
      people = cause "People" {
        training = subCause "No training"
        fatigue = subCause "Fatigue"
      }
      process = cause "Process" {
        norev = subCause "No code review"
      }
      tools = cause "Tools"
    }
  }
  views { view fish "Root causes" { include * autolayout lr } }`)

  it('nests causes under the problem and sub-causes under their cause', () => {
    expect(m.elements['people'].parentId).toBe('defects')
    expect(m.elements['training'].parentId).toBe('people')
    expect(m.elements['defects'].children).toContain('people')
    expect(m.elements['people'].children).toEqual(['training', 'fatigue'])
  })

  it('builds a fishbone frame with one bone per cause, alternating sides', () => {
    const { nodes } = modelToFlow(m, view(m))
    const problem = nodes.find(n => n.id === 'defects')!
    const fb = problem.data.ishikawa!
    expect(fb).toBeTruthy()
    expect(fb.bones).toHaveLength(3)
    // causes are children of the problem (parentId set → drag moves the whole graph)
    for (const id of ['people', 'process', 'tools']) {
      expect(nodes.find(n => n.id === id)!.parentId).toBe('defects')
    }
    // people (index 0) above the spine, process (index 1) below
    const py = (id: string) => nodes.find(n => n.id === id)!.position.y
    expect(py('people')).toBeLessThan(fb.spineY)
    expect(py('process')).toBeGreaterThan(fb.spineY)
    // sub-causes are children of their cause (reparent target on drag)
    expect(nodes.find(n => n.id === 'training')!.parentId).toBe('people')
  })

  it('supports several independent problems and draws no chart decor', () => {
    const m2 = parse(`model {
      a = problem "A" { c1 = cause "C1" }
      b = problem "B" { c2 = cause "C2" }
    }
    views { view f { include * autolayout lr } }`)
    const { nodes } = modelToFlow(m2, view(m2))
    expect(nodes.find(n => n.id === 'a')!.data.ishikawa).toBeTruthy()
    expect(nodes.find(n => n.id === 'b')!.data.ishikawa).toBeTruthy()
  })
})

describe('quadrant chart layout', () => {
  it('places items from x/y properties (origin bottom-left)', () => {
    const m = parse(`model {
      chart = quadrantChart "Prioritisation" {
        q1 "Do first"
        xLabel "Effort"
        yLabel "Impact"
        a = quadrantItem "A" { x "0.9" y "0.9" }
        b = quadrantItem "B" { x "0.1" y "0.1" }
      }
    }
    views { view q "Quadrants" { include chart, chart.* autolayout lr } }`)
    expect(m.elements['a'].properties.x).toBe('0.9')
    const { nodes } = modelToFlow(m, view(m))
    const a = nodes.find(n => n.id === 'a')!
    const b = nodes.find(n => n.id === 'b')!
    // a top-right of b (y axis points up)
    expect(a.position.x).toBeGreaterThan(b.position.x)
    expect(a.position.y).toBeLessThan(b.position.y)
    const chart = nodes.find(n => n.id === 'chart')!
    expect(chart.width).toBe(480)
    expect((chart.data as { chartProps?: Record<string, string> }).chartProps?.q1).toBe('Do first')
  })
})

describe('timeline graph container', () => {
  it('orders events left to right, alternating above/below the spine', () => {
    const m = parse(`model {
      tl = timelineGraph "History" {
        e1 = timelineEvent "Founded" { date "2019" }
        e2 = timelineEvent "Seed round" { date "2021" }
        e3 = timelineEvent "Launch" { date "2023" }
      }
    }
    views { view t "History" { include * autolayout lr } }`)
    const { nodes } = modelToFlow(m, view(m))
    for (const id of ['e1', 'e2', 'e3']) expect(nodes.find(n => n.id === id)!.parentId).toBe('tl')
    const pos = (id: string) => nodes.find(n => n.id === id)!.position
    const xs = ['e1', 'e2', 'e3'].map(id => pos(id).x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
    // alternation: e1 above, e2 below, e3 above
    expect(pos('e1').y).toBeLessThan(pos('e2').y)
    expect(pos('e3').y).toBeLessThan(pos('e2').y)
    // dates from properties print on the spine
    const frame = nodes.find(n => n.id === 'tl')!
    expect(frame.data.chartFrame!.texts.map(t => t.text)).toEqual(['2019', '2021', '2023'])
  })
})

describe('tree graph container (file tree)', () => {
  it('consumes tree elements into a forest widget, not as separate nodes', () => {
    const m = parse(`model {
      files = treeGraph "Project" {
        root = treeRoot "app" {
          src = treeNode "src" {
            a = treeLeaf "App.tsx"
            b = treeLeaf "main.tsx"
          }
          readme = treeLeaf "README.md"
        }
      }
    }
    views { view t { include * autolayout lr } }`)
    // DSL nesting preserved
    expect(m.elements['a'].parentId).toBe('src')
    const { nodes, edges } = modelToFlow(m, view(m))
    // only the treeGraph frame is a node; the tree elements are widget rows
    expect(nodes.find(n => n.id === 'files')!.data.tree).toBeTruthy()
    for (const id of ['root', 'src', 'a', 'b', 'readme']) {
      expect(nodes.find(n => n.id === id)).toBeUndefined()
    }
    // forest structure: one root "app" with children src (2 leaves) + readme
    const forest = nodes.find(n => n.id === 'files')!.data.tree!
    expect(forest).toHaveLength(1)
    expect(forest[0].label).toBe('app')
    expect(forest[0].children.map(c => c.id)).toEqual(['src', 'readme'])
    expect(forest[0].children[0].children.map(c => c.label)).toEqual(['App.tsx', 'main.tsx'])
    expect(edges).toHaveLength(0)
  })
})

describe('multiple chart containers', () => {
  it('lays out independent frames without overlap', () => {
    const m = parse(`model {
      s = seqGraph "S" { a = participant "A" b = participant "B" }
      g = gitGraph "G" { c1 = commit "init" }
      a -> b : message "hi"
    }
    views { view all { include * autolayout lr } }`)
    const { nodes } = modelToFlow(m, view(m))
    const s = nodes.find(n => n.id === 's')!
    const g = nodes.find(n => n.id === 'g')!
    expect(s.data.chartFrame).toBeTruthy()
    expect(g.data.chartFrame).toBeTruthy()
    // each frame bounds its own children
    expect(nodes.find(n => n.id === 'a')!.parentId).toBe('s')
    expect(nodes.find(n => n.id === 'c1')!.parentId).toBe('g')
  })
})
