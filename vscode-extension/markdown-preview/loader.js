(() => {
  const apiName = 'GraphModelStudioMarkdownPreview'
  const promiseName = '__gmcMarkdownRuntimePromise'
  const run = () => window[apiName]?.scheduleRender?.()

  if (window[apiName]?.scheduleRender) {
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
    .then(run)
    .catch(error => {
      for (const figure of document.querySelectorAll('.gmc-markdown-diagram')) {
        figure.classList.add('gmc-markdown-error')
        figure.textContent = error instanceof Error ? error.message : String(error)
      }
    })
})()
