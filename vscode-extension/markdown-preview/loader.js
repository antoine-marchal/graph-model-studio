(() => {
  const apiName = 'GraphModelStudioMarkdownPreview'
  const promiseName = '__gmcMarkdownRuntimePromise'
  const observerName = '__gmcMarkdownPreviewObserver'
  const run = () => window[apiName]?.scheduleRender?.()

  // VS Code's legacy Markdown preview keeps contributed scripts alive while it
  // replaces the rendered document. The old loader only ran once, so every
  // refresh after the first one left newly-created GMC figures untouched.
  // Watch for fresh, unrendered figures and schedule the shared runtime again.
  const observePreviewUpdates = () => {
    if (window[observerName]) return
    const containsUnrenderedDiagram = node => {
      if (!(node instanceof Element)) return false
      if (node.matches('.gmc-markdown-diagram:not([data-gmc-rendered="true"])')) return true
      return !!node.querySelector('.gmc-markdown-diagram:not([data-gmc-rendered="true"])')
    }
    const observer = new MutationObserver(mutations => {
      const needsRender = mutations.some(mutation => {
        if (mutation.type === 'attributes') {
          const figure = mutation.target.closest?.('.gmc-markdown-diagram')
          if (figure) {
            delete figure.dataset.gmcRendered
            return true
          }
        }
        if ([...mutation.addedNodes].some(containsUnrenderedDiagram)) return true
        return mutation.target instanceof Element
          && mutation.target.matches('.gmc-markdown-diagram:not([data-gmc-rendered="true"])')
      })
      if (needsRender) run()
    })
    // Observe the Document because the legacy preview replaces its root element
    // during refreshes. An observer attached to documentElement becomes detached
    // after the first update and leaves the new GMC placeholder stuck loading.
    observer.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'data-gmc-source',
        'data-gmc-id',
        'data-gmc-view',
        'data-gmc-theme',
        'data-gmc-width',
        'data-gmc-height',
      ],
    })
    window[observerName] = observer
  }

  if (window[apiName]?.scheduleRender) {
    observePreviewUpdates()
    run()
    return
  }

  if (!window[promiseName]) {
    const loaderScript = document.currentScript
    const loaderUrl = loaderScript?.src
    const nonce = loaderScript?.nonce
    window[promiseName] = new Promise((resolve, reject) => {
      if (!loaderUrl) {
        reject(new Error('Could not locate the Graph Model Studio Markdown runtime.'))
        return
      }
      const script = document.createElement('script')
      script.src = new URL('runtime.js', loaderUrl).href
      if (nonce) script.nonce = nonce
      script.async = true
      script.addEventListener('load', resolve, { once: true })
      script.addEventListener('error', () => reject(new Error('Could not load the Graph Model Studio Markdown runtime.')), { once: true })
      document.head.append(script)
    })
  }

  window[promiseName]
    .then(() => {
      observePreviewUpdates()
      run()
    })
    .catch(error => {
      for (const figure of document.querySelectorAll('.gmc-markdown-diagram')) {
        figure.classList.add('gmc-markdown-error')
        figure.textContent = error instanceof Error ? error.message : String(error)
      }
    })
})()
