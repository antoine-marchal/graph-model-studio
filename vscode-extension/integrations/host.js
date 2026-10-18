'use strict'

const gmc = require('../dist/extension.js')
const richEditor = require('../dist/rich-editor/extension.js')
const markdownEmbedder = require('./markdown-code-embedder/extension.js')
const markdownToolkit = require('./markdown-toolkit/extension.js')
const slides = require('../dist/slides-studio/extension.cjs')

function activate(context) {
  markdownEmbedder.activate(context)
  markdownToolkit.activate(context)
  richEditor.activate(context)
  const api = gmc.activate(context)
  // Corporate Slides Studio (PowerPoint as code); its API serves the extension host tests.
  return { ...api, slides: slides.activate(context) }
}

function deactivate() {
  richEditor.deactivate?.()
  markdownToolkit.deactivate?.()
  slides.deactivate?.()
  markdownEmbedder.deactivate?.()
  gmc.deactivate?.()
}

module.exports = { activate, deactivate }
