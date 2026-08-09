import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseDsl } from '@/core/dsl/parser'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import { BpmnGatewayName, type GraphNodeData } from '@/features/editor-graph/nodes/GraphNode'

describe('BPMN gateway rendering', () => {
  it('keeps the node box on the diamond and displays only its name', () => {
    const parsed = parseDsl(`model {
      decision = exclusiveGateway "Route request" {
        description "Choose the processing path"
        technology "Rules Engine"
        tags "approval" "routing"
      }
    }
    views { view main { include * decision size 70 70 } }`)
    expect(parsed.diagnostics.filter(item => item.severity === 'error')).toHaveLength(0)
    const model = parsed.model!
    const flow = modelToFlow(model, model.views.main)
    const gateway = flow.nodes.find(node => node.id === 'decision')!

    expect(gateway.style?.width).toBe(70)
    expect(gateway.style?.height).toBe(70)

    const markup = renderToStaticMarkup(createElement(BpmnGatewayName, {
      data: gateway.data as GraphNodeData,
    }))
    expect(markup).toContain('Route request')
    expect(markup).not.toContain('Choose the processing path')
    expect(markup).not.toContain('Rules Engine')
    expect(markup).not.toContain('#approval')
  })
})
