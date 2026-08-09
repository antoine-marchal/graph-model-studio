'use strict'

const gmc = require('../dist/extension.js')
const markdownEmbedder = require('./markdown-code-embedder/extension.js')
const markdownToolkit = require('./markdown-toolkit/extension.js')

function activate(context) {
  markdownEmbedder.activate(context)
  markdownToolkit.activate(context)
  return gmc.activate(context)
}

function deactivate() {
  markdownToolkit.deactivate?.()
  markdownEmbedder.deactivate?.()
  gmc.deactivate?.()
}

module.exports = { activate, deactivate }
