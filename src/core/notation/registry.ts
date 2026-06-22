import type { NotationKind } from '../model'

export type NodeShape =
  | 'rectangle'
  | 'roundedRectangle'
  | 'stadium'
  | 'circle'
  | 'doubleCircle'
  | 'thickCircle'
  | 'diamond'
  | 'cylinder'
  | 'person'
  | 'parallelogram'
  | 'folder'
  | 'container'

export type IconKind =
  // ArchiMate generic-by-category
  | 'archi-actor' | 'archi-role' | 'archi-collaboration' | 'archi-interface'
  | 'archi-process' | 'archi-function' | 'archi-interaction' | 'archi-event'
  | 'archi-service' | 'archi-object' | 'archi-contract' | 'archi-representation' | 'archi-product'
  | 'archi-component' | 'archi-dataObject'
  | 'archi-node' | 'archi-device' | 'archi-systemSoftware' | 'archi-artifact'
  | 'archi-path' | 'archi-network' | 'archi-equipment' | 'archi-facility' | 'archi-material'
  | 'archi-stakeholder' | 'archi-driver' | 'archi-assessment' | 'archi-goal' | 'archi-outcome'
  | 'archi-principle' | 'archi-requirement' | 'archi-constraint' | 'archi-meaning' | 'archi-value'
  | 'archi-resource' | 'archi-capability' | 'archi-courseOfAction' | 'archi-valueStream'
  | 'archi-workPackage' | 'archi-deliverable' | 'archi-plateau' | 'archi-gap'
  | 'archi-location' | 'archi-grouping' | 'archi-junction'
  // BPMN
  | 'bpmn-task' | 'bpmn-userTask' | 'bpmn-serviceTask'
  | 'bpmn-exclusiveGateway' | 'bpmn-parallelGateway' | 'bpmn-gateway'
  | 'none'

export interface ElementTypeDefinition {
  type: string
  label: string
  notation: NotationKind
  /** sub-group label inside the notation (e.g. "Business", "Application") */
  group?: string
  shape: NodeShape
  fill: string
  stroke: string
  text: string
  accent: string
  icon: IconKind
  /** optional raster glyph (served from /public); takes precedence over `icon` */
  iconSrc?: string
  description?: string
  defaultWidth: number
  defaultHeight: number
}

export type MarkerId =
  | 'gms-arrow-open' | 'gms-arrow-filled' | 'gms-triangle-hollow'
  | 'gms-diamond-filled' | 'gms-diamond-hollow' | 'gms-ball' | 'gms-circle-open'

export interface RelationTypeDefinition {
  type: string
  label: string
  notation: NotationKind
  lineStyle: 'solid' | 'dashed' | 'dotted'
  markerStart?: MarkerId
  markerEnd?: MarkerId
}

export interface NotationRegistry {
  getElementTypes(notation: NotationKind): ElementTypeDefinition[]
  getRelationTypes(notation: NotationKind): RelationTypeDefinition[]
  getAllRelationTypes(): RelationTypeDefinition[]
  getElementDef(type: string): ElementTypeDefinition | undefined
  getRelationDef(type: string): RelationTypeDefinition | undefined
  getAllElementTypes(): ElementTypeDefinition[]
  getNotations(): { kind: NotationKind; label: string }[]
  /** ordered groups within a notation (for menus) */
  getGroups(notation: NotationKind): string[]
}

const RECT = { defaultWidth: 160, defaultHeight: 74 }
const WIDE = { defaultWidth: 170, defaultHeight: 70 }
const SMALL = { defaultWidth: 56, defaultHeight: 56 }
const TINY = { defaultWidth: 28, defaultHeight: 28 }
const DIAMOND = { defaultWidth: 70, defaultHeight: 70 }
const PERSON = { defaultWidth: 110, defaultHeight: 108 }

// ─── C4 ──────────────────────────────────────────────────────────────────────
const C4_ELEMENTS: ElementTypeDefinition[] = [
  { type: 'person', label: 'Person', notation: 'c4', shape: 'person', fill: '#08427B', stroke: '#073B6F', text: '#FFFFFF', accent: '#1168BD', icon: 'none', ...PERSON },
  { type: 'softwareSystem', label: 'Software System', notation: 'c4', shape: 'roundedRectangle', fill: '#1168BD', stroke: '#0C518F', text: '#FFFFFF', accent: '#3C8DDC', icon: 'none', ...RECT },
  { type: 'container', label: 'Container', notation: 'c4', shape: 'roundedRectangle', fill: '#438DD5', stroke: '#357AC0', text: '#FFFFFF', accent: '#6FA9DF', icon: 'none', ...RECT },
  { type: 'component', label: 'Component', notation: 'c4', shape: 'roundedRectangle', fill: '#85BBF0', stroke: '#6FA8DD', text: '#0A2540', accent: '#3C8DDC', icon: 'none', ...RECT },
  { type: 'codeElement', label: 'Code Element', notation: 'c4', shape: 'rectangle', fill: '#C9DEF5', stroke: '#A9C7E8', text: '#0A2540', accent: '#3C8DDC', icon: 'none', ...RECT },
]

// ─── ArchiMate — layer palettes ──────────────────────────────────────────────
// Fills follow the project ArchiMate spec (specifications.c4); strokes/accents are
// darker shades of the same hue, text a near-black of the hue for contrast.
const A_MOTIVATION = { fill: '#C7C3F4', stroke: '#6F67C9', text: '#221A4D', accent: '#6F67C9' }
const A_STRATEGY = { fill: '#EFD79A', stroke: '#B08A2E', text: '#3A2A00', accent: '#B08A2E' }
const A_BUSINESS = { fill: '#F2EEA6', stroke: '#B7A40A', text: '#3A3400', accent: '#B7A40A' }
const A_APP = { fill: '#A8E7EF', stroke: '#2A9FB3', text: '#06303A', accent: '#2A9FB3' }
const A_TECH = { fill: '#B9DCAE', stroke: '#4F9A3F', text: '#16320D', accent: '#4F9A3F' }
const A_PHYSICAL = { fill: '#B9DCAE', stroke: '#2E7D32', text: '#0B2E12', accent: '#2E7D32' }
const A_IMPL = { fill: '#F3D0D0', stroke: '#C06A6A', text: '#3E1414', accent: '#C06A6A' }
const A_OTHER = { fill: '#ECEFF1', stroke: '#90A4AE', text: '#1F2933', accent: '#78909C' }

type Pal = { fill: string; stroke: string; text: string; accent: string }
function archi(
  group: string, pal: Pal,
  defs: Array<[type: string, label: string, shape: NodeShape, icon: IconKind, size?: { defaultWidth: number; defaultHeight: number }]>,
): ElementTypeDefinition[] {
  return defs.map(([type, label, shape, icon, size]) => ({
    type, label, notation: 'archimate' as const, group, shape, ...pal, icon, ...(size ?? RECT),
  }))
}

const ARCHIMATE_ELEMENTS: ElementTypeDefinition[] = [
  ...archi('Strategy', A_STRATEGY, [
    ['resource', 'Resource', 'rectangle', 'archi-resource'],
    ['capability', 'Capability', 'roundedRectangle', 'archi-capability'],
    ['courseOfAction', 'Course of Action', 'roundedRectangle', 'archi-courseOfAction'],
    ['valueStream', 'Value Stream', 'roundedRectangle', 'archi-valueStream', WIDE],
  ]),
  ...archi('Business', A_BUSINESS, [
    ['businessActor', 'Business Actor', 'rectangle', 'archi-actor'],
    ['businessRole', 'Business Role', 'rectangle', 'archi-role'],
    ['businessCollaboration', 'Business Collaboration', 'rectangle', 'archi-collaboration'],
    ['businessInterface', 'Business Interface', 'rectangle', 'archi-interface'],
    ['businessProcess', 'Business Process', 'roundedRectangle', 'archi-process'],
    ['businessFunction', 'Business Function', 'roundedRectangle', 'archi-function'],
    ['businessInteraction', 'Business Interaction', 'roundedRectangle', 'archi-interaction'],
    ['businessEvent', 'Business Event', 'roundedRectangle', 'archi-event'],
    ['businessService', 'Business Service', 'stadium', 'archi-service'],
    ['businessObject', 'Business Object', 'rectangle', 'archi-object'],
    ['contract', 'Contract', 'rectangle', 'archi-contract'],
    ['representation', 'Representation', 'rectangle', 'archi-representation'],
    ['product', 'Product', 'rectangle', 'archi-product'],
  ]),
  ...archi('Application', A_APP, [
    ['applicationComponent', 'Application Component', 'rectangle', 'archi-component'],
    ['applicationCollaboration', 'Application Collaboration', 'rectangle', 'archi-collaboration'],
    ['applicationInterface', 'Application Interface', 'rectangle', 'archi-interface'],
    ['applicationFunction', 'Application Function', 'roundedRectangle', 'archi-function'],
    ['applicationInteraction', 'Application Interaction', 'roundedRectangle', 'archi-interaction'],
    ['applicationProcess', 'Application Process', 'roundedRectangle', 'archi-process'],
    ['applicationEvent', 'Application Event', 'roundedRectangle', 'archi-event'],
    ['applicationService', 'Application Service', 'stadium', 'archi-service'],
    ['dataObject', 'Data Object', 'rectangle', 'archi-dataObject'],
  ]),
  ...archi('Technology', A_TECH, [
    ['technologyNode', 'Node', 'rectangle', 'archi-node'],
    ['device', 'Device', 'rectangle', 'archi-device'],
    ['systemSoftware', 'System Software', 'rectangle', 'archi-systemSoftware'],
    ['technologyCollaboration', 'Technology Collaboration', 'rectangle', 'archi-collaboration'],
    ['technologyInterface', 'Technology Interface', 'rectangle', 'archi-interface'],
    ['path', 'Path', 'rectangle', 'archi-path'],
    ['communicationNetwork', 'Communication Network', 'rectangle', 'archi-network'],
    ['technologyFunction', 'Technology Function', 'roundedRectangle', 'archi-function'],
    ['technologyProcess', 'Technology Process', 'roundedRectangle', 'archi-process'],
    ['technologyInteraction', 'Technology Interaction', 'roundedRectangle', 'archi-interaction'],
    ['technologyEvent', 'Technology Event', 'roundedRectangle', 'archi-event'],
    ['technologyService', 'Technology Service', 'stadium', 'archi-service'],
    ['artifact', 'Artifact', 'rectangle', 'archi-artifact'],
  ]),
  ...archi('Physical', A_PHYSICAL, [
    ['equipment', 'Equipment', 'rectangle', 'archi-equipment'],
    ['facility', 'Facility', 'rectangle', 'archi-facility'],
    ['distributionNetwork', 'Distribution Network', 'rectangle', 'archi-network'],
    ['material', 'Material', 'rectangle', 'archi-material'],
  ]),
  ...archi('Motivation', A_MOTIVATION, [
    ['stakeholder', 'Stakeholder', 'rectangle', 'archi-stakeholder'],
    ['driver', 'Driver', 'rectangle', 'archi-driver'],
    ['assessment', 'Assessment', 'rectangle', 'archi-assessment'],
    ['goal', 'Goal', 'rectangle', 'archi-goal'],
    ['outcome', 'Outcome', 'rectangle', 'archi-outcome'],
    ['principle', 'Principle', 'rectangle', 'archi-principle'],
    ['requirement', 'Requirement', 'rectangle', 'archi-requirement'],
    ['constraint', 'Constraint', 'rectangle', 'archi-constraint'],
    ['meaning', 'Meaning', 'rectangle', 'archi-meaning'],
    ['archimateValue', 'Value', 'rectangle', 'archi-value'],
  ]),
  ...archi('Implementation', A_IMPL, [
    ['workPackage', 'Work Package', 'roundedRectangle', 'archi-workPackage'],
    ['deliverable', 'Deliverable', 'rectangle', 'archi-deliverable'],
    ['implementationEvent', 'Implementation Event', 'roundedRectangle', 'archi-event'],
    ['plateau', 'Plateau', 'rectangle', 'archi-plateau'],
    ['gap', 'Gap', 'rectangle', 'archi-gap'],
  ]),
  ...archi('Other', A_OTHER, [
    ['location', 'Location', 'rectangle', 'archi-location'],
    ['grouping', 'Grouping', 'container', 'archi-grouping', { defaultWidth: 320, defaultHeight: 200 }],
    ['junctionAnd', 'Junction (AND)', 'circle', 'archi-junction', TINY],
    ['junctionOr', 'Junction (OR)', 'circle', 'archi-junction', TINY],
  ]),
]

// Authentic ArchiMate glyphs (PNG, served from /public/icons/archimate).
// Keys are element `type`s; values are file basenames (without extension).
const ARCHIMATE_ICON_FILES: Record<string, string> = {
  // Business
  businessActor: 'busactor', businessRole: 'busrole', businessCollaboration: 'buscollab',
  businessInterface: 'businterface', businessProcess: 'busprocess', businessFunction: 'busfunction',
  businessInteraction: 'businteraction', businessEvent: 'busevent', businessService: 'busservice',
  businessObject: 'busobject', contract: 'buscontract', representation: 'busrepresentation', product: 'busproduct',
  // Application
  applicationComponent: 'appcomponent', applicationCollaboration: 'appcollab', applicationInterface: 'appinterface',
  applicationFunction: 'appfunction', applicationInteraction: 'appinteraction', applicationProcess: 'appprocess',
  applicationEvent: 'appevent', applicationService: 'appservice', dataObject: 'appdataobject',
  // Technology
  technologyNode: 'technode', device: 'techdevice', systemSoftware: 'techsoftware',
  technologyCollaboration: 'techcollab', technologyInterface: 'techinterfac', path: 'techpaths',
  communicationNetwork: 'technetwork', technologyFunction: 'techfunction', technologyProcess: 'techprocess',
  technologyInteraction: 'techinteract', technologyEvent: 'techevent', technologyService: 'techservice',
  artifact: 'techartifact',
  // Physical
  equipment: 'techequipment', facility: 'techfacility', distributionNetwork: 'technetwork', material: 'techmaterial',
  // Motivation
  stakeholder: 'stratstakeholder', driver: 'stratdriver', assessment: 'stratassessment', goal: 'stratgoal',
  outcome: 'stratoutcome', principle: 'stratprincipe', requirement: 'stratreq', constraint: 'stratconstraint',
  meaning: 'stratmeaning', archimateValue: 'stratvalue',
  // Strategy
  resource: 'stratresource', capability: 'stratcap', courseOfAction: 'stratcourseofaction', valueStream: 'busvaluestream',
  // Implementation & migration
  workPackage: 'implwk', deliverable: 'impldeliverable', implementationEvent: 'implprocess',
  plateau: 'implplateau', gap: 'implgap',
  // Other
  location: 'stratlocation', grouping: 'group',
}
for (const el of ARCHIMATE_ELEMENTS) {
  const file = ARCHIMATE_ICON_FILES[el.type]
  if (file) el.iconSrc = `icons/archimate/${file}.png`
}

// ─── BPMN ────────────────────────────────────────────────────────────────────
const BPMN_ELEMENTS: ElementTypeDefinition[] = [
  { type: 'startEvent', label: 'Start Event', notation: 'bpmn', group: 'Events', shape: 'thickCircle', fill: '#E8F8EC', stroke: '#3FA34D', text: '#0B2E12', accent: '#3FA34D', icon: 'none', ...SMALL },
  { type: 'endEvent', label: 'End Event', notation: 'bpmn', group: 'Events', shape: 'thickCircle', fill: '#FBE9E7', stroke: '#D84315', text: '#3E140A', accent: '#D84315', icon: 'none', ...SMALL },
  { type: 'intermediateEvent', label: 'Intermediate Event', notation: 'bpmn', group: 'Events', shape: 'doubleCircle', fill: '#FFF8E1', stroke: '#C9A100', text: '#3A2F00', accent: '#C9A100', icon: 'none', ...SMALL },
  { type: 'task', label: 'Task', notation: 'bpmn', group: 'Activities', shape: 'roundedRectangle', fill: '#FFFFFF', stroke: '#5B7C99', text: '#1F2933', accent: '#5B7C99', icon: 'bpmn-task', ...RECT },
  { type: 'userTask', label: 'User Task', notation: 'bpmn', group: 'Activities', shape: 'roundedRectangle', fill: '#FFFFFF', stroke: '#5B7C99', text: '#1F2933', accent: '#5B7C99', icon: 'bpmn-userTask', ...RECT },
  { type: 'serviceTask', label: 'Service Task', notation: 'bpmn', group: 'Activities', shape: 'roundedRectangle', fill: '#FFFFFF', stroke: '#5B7C99', text: '#1F2933', accent: '#5B7C99', icon: 'bpmn-serviceTask', ...RECT },
  { type: 'subProcess', label: 'Sub-Process', notation: 'bpmn', group: 'Activities', shape: 'container', fill: 'rgba(91,124,153,0.06)', stroke: '#5B7C99', text: '#1F2933', accent: '#5B7C99', icon: 'none', defaultWidth: 360, defaultHeight: 200 },
  { type: 'gateway', label: 'Gateway', notation: 'bpmn', group: 'Gateways', shape: 'diamond', fill: '#FFF6CC', stroke: '#C9A100', text: '#3A2F00', accent: '#C9A100', icon: 'bpmn-gateway', ...DIAMOND },
  { type: 'exclusiveGateway', label: 'Exclusive Gateway', notation: 'bpmn', group: 'Gateways', shape: 'diamond', fill: '#FFF6CC', stroke: '#C9A100', text: '#3A2F00', accent: '#C9A100', icon: 'bpmn-exclusiveGateway', ...DIAMOND },
  { type: 'parallelGateway', label: 'Parallel Gateway', notation: 'bpmn', group: 'Gateways', shape: 'diamond', fill: '#FFF6CC', stroke: '#C9A100', text: '#3A2F00', accent: '#C9A100', icon: 'bpmn-parallelGateway', ...DIAMOND },
  { type: 'pool', label: 'Pool', notation: 'bpmn', group: 'Swimlanes', shape: 'container', fill: 'rgba(91,124,153,0.07)', stroke: '#5B7C99', text: '#1F2933', accent: '#5B7C99', icon: 'none', defaultWidth: 520, defaultHeight: 240 },
  { type: 'lane', label: 'Lane', notation: 'bpmn', group: 'Swimlanes', shape: 'container', fill: 'rgba(91,124,153,0.04)', stroke: '#7C99B5', text: '#1F2933', accent: '#7C99B5', icon: 'none', defaultWidth: 480, defaultHeight: 110 },
  { type: 'dataObjectBpmn', label: 'Data Object', notation: 'bpmn', group: 'Data', shape: 'rectangle', fill: '#FFFFFF', stroke: '#5B7C99', text: '#1F2933', accent: '#5B7C99', icon: 'archi-dataObject', ...RECT },
]

// ─── Flowchart ───────────────────────────────────────────────────────────────
const FLOWCHART_ELEMENTS: ElementTypeDefinition[] = [
  { type: 'start', label: 'Start', notation: 'flowchart', shape: 'stadium', fill: '#2E7D32', stroke: '#1B5E20', text: '#FFFFFF', accent: '#43A047', icon: 'none', defaultWidth: 120, defaultHeight: 52 },
  { type: 'end', label: 'End', notation: 'flowchart', shape: 'stadium', fill: '#C62828', stroke: '#8E1B1B', text: '#FFFFFF', accent: '#E53935', icon: 'none', defaultWidth: 120, defaultHeight: 52 },
  { type: 'process', label: 'Process', notation: 'flowchart', shape: 'rectangle', fill: '#1565C0', stroke: '#0D47A1', text: '#FFFFFF', accent: '#1E88E5', icon: 'none', ...RECT },
  { type: 'decision', label: 'Decision', notation: 'flowchart', shape: 'diamond', fill: '#EF6C00', stroke: '#BF5500', text: '#FFFFFF', accent: '#FB8C00', icon: 'none', defaultWidth: 110, defaultHeight: 90 },
  { type: 'inputOutput', label: 'Input / Output', notation: 'flowchart', shape: 'parallelogram', fill: '#6A1B9A', stroke: '#4A148C', text: '#FFFFFF', accent: '#8E24AA', icon: 'none', defaultWidth: 160, defaultHeight: 64 },
  { type: 'connector', label: 'Connector', notation: 'flowchart', shape: 'circle', fill: '#455A64', stroke: '#263238', text: '#FFFFFF', accent: '#607D8B', icon: 'none', defaultWidth: 44, defaultHeight: 44 },
]

// ─── Generic ─────────────────────────────────────────────────────────────────
const GENERIC_ELEMENTS: ElementTypeDefinition[] = [
  { type: 'node', label: 'Node', notation: 'generic', shape: 'roundedRectangle', fill: '#374151', stroke: '#1F2937', text: '#F3F4F6', accent: '#6B7280', icon: 'none', ...RECT },
  { type: 'group', label: 'Group', notation: 'generic', shape: 'container', fill: 'rgba(107,114,128,0.07)', stroke: '#6B7280', text: '#9CA3AF', accent: '#9CA3AF', icon: 'none', defaultWidth: 360, defaultHeight: 220 },
  { type: 'external', label: 'External', notation: 'generic', shape: 'rectangle', fill: '#4B5563', stroke: '#374151', text: '#E5E7EB', accent: '#9CA3AF', icon: 'none', ...RECT },
]

const ALL_ELEMENTS = [
  ...C4_ELEMENTS, ...ARCHIMATE_ELEMENTS, ...BPMN_ELEMENTS, ...FLOWCHART_ELEMENTS, ...GENERIC_ELEMENTS,
]
const elementByType = new Map(ALL_ELEMENTS.map(e => [e.type, e]))
const byNotation = new Map<NotationKind, ElementTypeDefinition[]>([
  ['c4', C4_ELEMENTS], ['archimate', ARCHIMATE_ELEMENTS], ['bpmn', BPMN_ELEMENTS],
  ['flowchart', FLOWCHART_ELEMENTS], ['generic', GENERIC_ELEMENTS],
])

// ─── Relations ───────────────────────────────────────────────────────────────
const RELATIONS: RelationTypeDefinition[] = [
  { type: 'rel', label: 'Relationship', notation: 'generic', lineStyle: 'solid', markerEnd: 'gms-arrow-open' },
  { type: 'association', label: 'Association', notation: 'generic', lineStyle: 'solid' },
  // ArchiMate structural / dependency / dynamic
  { type: 'composition', label: 'Composition', notation: 'archimate', lineStyle: 'solid', markerStart: 'gms-diamond-filled' },
  { type: 'aggregation', label: 'Aggregation', notation: 'archimate', lineStyle: 'solid', markerStart: 'gms-diamond-hollow' },
  { type: 'assignment', label: 'Assignment', notation: 'archimate', lineStyle: 'solid', markerStart: 'gms-ball', markerEnd: 'gms-arrow-filled' },
  { type: 'realization', label: 'Realization', notation: 'archimate', lineStyle: 'dashed', markerEnd: 'gms-triangle-hollow' },
  { type: 'serving', label: 'Serving', notation: 'archimate', lineStyle: 'solid', markerEnd: 'gms-arrow-open' },
  { type: 'access', label: 'Access', notation: 'archimate', lineStyle: 'dotted', markerEnd: 'gms-arrow-open' },
  { type: 'influence', label: 'Influence', notation: 'archimate', lineStyle: 'dashed', markerEnd: 'gms-arrow-open' },
  { type: 'triggering', label: 'Triggering', notation: 'archimate', lineStyle: 'solid', markerEnd: 'gms-arrow-filled' },
  { type: 'flow', label: 'Flow', notation: 'archimate', lineStyle: 'dashed', markerEnd: 'gms-arrow-filled' },
  { type: 'specialization', label: 'Specialization', notation: 'archimate', lineStyle: 'solid', markerEnd: 'gms-triangle-hollow' },
  // BPMN
  { type: 'sequenceFlow', label: 'Sequence Flow', notation: 'bpmn', lineStyle: 'solid', markerEnd: 'gms-arrow-filled' },
  { type: 'messageFlow', label: 'Message Flow', notation: 'bpmn', lineStyle: 'dashed', markerStart: 'gms-circle-open', markerEnd: 'gms-arrow-open' },
  // Flowchart
  { type: 'flowArrow', label: 'Flow', notation: 'flowchart', lineStyle: 'solid', markerEnd: 'gms-arrow-filled' },
]
const relationByType = new Map(RELATIONS.map(r => [r.type, r]))

function uniqueGroups(defs: ElementTypeDefinition[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const d of defs) {
    const g = d.group ?? '_'
    if (!seen.has(g)) { seen.add(g); out.push(g) }
  }
  return out
}

export const notationRegistry: NotationRegistry = {
  getElementTypes: n => byNotation.get(n) ?? [],
  getRelationTypes: n => RELATIONS.filter(r => r.notation === n || r.notation === 'generic'),
  getAllRelationTypes: () => RELATIONS,
  getElementDef: t => elementByType.get(t),
  getRelationDef: t => relationByType.get(t),
  getAllElementTypes: () => ALL_ELEMENTS,
  getNotations: () => [
    { kind: 'c4', label: 'C4 Model' },
    { kind: 'archimate', label: 'ArchiMate' },
    { kind: 'bpmn', label: 'BPMN' },
    { kind: 'flowchart', label: 'Flowchart' },
    { kind: 'generic', label: 'Generic' },
  ],
  getGroups: n => uniqueGroups(byNotation.get(n) ?? []),
}
