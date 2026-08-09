import architectureSource from './architecture.gmc?raw'
import deliverySource from './delivery.gmc?raw'
import collaborationSource from './collaboration.gmc?raw'
import analyticsSource from './analytics.gmc?raw'

export interface DemoGraph {
  id: string
  title: string
  description: string
  source: string
}

export const demoGraphs: DemoGraph[] = [
  {
    id: 'architecture',
    title: 'Architecture & data',
    description: 'C4, ArchiMate, use cases, UML, ERD, and generic graphs',
    source: architectureSource,
  },
  {
    id: 'delivery',
    title: 'Processes & delivery',
    description: 'BPMN, flowchart, PERT, Gantt, and timeline views',
    source: deliverySource,
  },
  {
    id: 'collaboration',
    title: 'Knowledge & collaboration',
    description: 'Sequence, tree, mindmap, Git, and Ishikawa diagrams',
    source: collaborationSource,
  },
  {
    id: 'analytics',
    title: 'Portfolio analytics',
    description: 'Quadrant, matrix, Sankey, radar, XY/bubble, and bar charts',
    source: analyticsSource,
  },
]
