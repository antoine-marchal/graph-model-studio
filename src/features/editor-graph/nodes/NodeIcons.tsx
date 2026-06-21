import type { IconKind } from '@/core/notation'

interface IconProps {
  color: string
  size?: number
}

/** ArchiMate-style mini glyphs (corner icons), 16x16 viewBox */
function ArchiActor({ color, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.3">
      <circle cx="8" cy="3.5" r="2" />
      <line x1="8" y1="5.5" x2="8" y2="11" />
      <line x1="3.5" y1="7.5" x2="12.5" y2="7.5" />
      <line x1="8" y1="11" x2="4.5" y2="14.5" />
      <line x1="8" y1="11" x2="11.5" y2="14.5" />
    </svg>
  )
}

function ArchiRole({ color, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.3">
      <circle cx="5" cy="8" r="3" />
      <line x1="8" y1="8" x2="14" y2="8" />
      <line x1="11" y1="5" x2="14" y2="5" />
      <line x1="11" y1="11" x2="14" y2="11" />
    </svg>
  )
}

function ArchiProcess({ color, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
      <path d="M2 5h7V3l5 5-5 5v-2H2z" />
    </svg>
  )
}

function ArchiAppComponent({ color, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.3">
      <rect x="4" y="2.5" width="9" height="11" />
      <rect x="1.5" y="4.5" width="4" height="2.5" fill={color} />
      <rect x="1.5" y="9" width="4" height="2.5" fill={color} />
    </svg>
  )
}

function ArchiAppService({ color, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.3">
      <rect x="1.5" y="5" width="13" height="6" rx="3" />
    </svg>
  )
}

function ArchiDataObject({ color, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.3">
      <rect x="2" y="3" width="12" height="10" />
      <line x1="2" y1="6" x2="14" y2="6" />
    </svg>
  )
}

function ArchiTechNode({ color, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.2">
      <path d="M2 6l3-3h9v7l-3 3H2z" />
      <line x1="2" y1="6" x2="11" y2="6" />
      <line x1="11" y1="6" x2="14" y2="3" />
      <line x1="11" y1="6" x2="11" y2="13" />
    </svg>
  )
}

function ArchiDevice({ color, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.3">
      <rect x="2" y="3" width="12" height="8" rx="1.5" />
      <line x1="4.5" y1="13.5" x2="11.5" y2="13.5" strokeWidth="2" />
    </svg>
  )
}

function ArchiSystemSoftware({ color, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.2">
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="6" />
    </svg>
  )
}

function ArchiArtifact({ color, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.3">
      <path d="M3 2h6l4 4v8H3z" />
      <path d="M9 2v4h4" />
    </svg>
  )
}

function BpmnUser({ color, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.3">
      <circle cx="8" cy="5" r="2.5" />
      <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    </svg>
  )
}

function BpmnService({ color, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
      <path d="M14 9.4l-1.4-.4a4.6 4.6 0 00-.4-1l.8-1.2-1.3-1.3-1.2.8a4.6 4.6 0 00-1-.4L8 3.2H6.2l-.4 1.4a4.6 4.6 0 00-1 .4l-1.2-.8L2.3 5.5l.8 1.2a4.6 4.6 0 00-.4 1L1.3 8v1.8l1.4.4c.1.4.2.7.4 1l-.8 1.2 1.3 1.3 1.2-.8c.3.2.6.3 1 .4l.4 1.4H8l.4-1.4c.4-.1.7-.2 1-.4l1.2.8 1.3-1.3-.8-1.2c.2-.3.3-.6.4-1l1.4-.4z" />
      <circle cx="7.6" cy="8.6" r="1.8" fill="#fff" />
    </svg>
  )
}

function BpmnTask({ color, size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.3">
      <rect x="2.5" y="3.5" width="11" height="9" rx="1" />
      <line x1="4.5" y1="6.5" x2="11.5" y2="6.5" />
      <line x1="4.5" y1="9.5" x2="9" y2="9.5" />
    </svg>
  )
}

/** Gateway markers — rendered centered inside the diamond */
function GwExclusive({ color, size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" stroke={color} strokeWidth="2.4" strokeLinecap="round">
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </svg>
  )
}

function GwParallel({ color, size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" stroke={color} strokeWidth="2.4" strokeLinecap="round">
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  )
}

const REGISTRY: Partial<Record<IconKind, (p: IconProps) => JSX.Element>> = {
  // actors / roles
  'archi-actor': ArchiActor,
  'archi-stakeholder': ArchiActor,
  'archi-role': ArchiRole,
  // behaviour (process / function / interaction)
  'archi-process': ArchiProcess,
  'archi-function': ArchiProcess,
  'archi-interaction': ArchiProcess,
  // active structure (component / collaboration)
  'archi-component': ArchiAppComponent,
  'archi-collaboration': ArchiAppComponent,
  // services
  'archi-service': ArchiAppService,
  'archi-capability': ArchiAppService,
  // passive structure (data / objects)
  'archi-dataObject': ArchiDataObject,
  'archi-object': ArchiDataObject,
  'archi-artifact': ArchiArtifact,
  // technology
  'archi-node': ArchiTechNode,
  'archi-device': ArchiDevice,
  'archi-systemSoftware': ArchiSystemSoftware,
  // bpmn
  'bpmn-task': BpmnTask,
  'bpmn-userTask': BpmnUser,
  'bpmn-serviceTask': BpmnService,
  'bpmn-exclusiveGateway': GwExclusive,
  'bpmn-parallelGateway': GwParallel,
}

export function NodeIcon({ kind, color, size }: { kind: IconKind; color: string; size?: number }) {
  const Comp = REGISTRY[kind]
  if (!Comp) return null
  return <Comp color={color} size={size} />
}

export function hasIcon(kind: IconKind): boolean {
  return kind in REGISTRY
}
