interface ViewEntry {
  id: string
  name: string
}

export function selectRenderViewId(
  views: Record<string, ViewEntry>,
  requestedView: string | undefined,
  currentViewId: string | null,
  preserveCurrentView: boolean,
): string | null {
  const preferredView = requestedView
    ? Object.values(views).find(view => view.id === requestedView || view.name === requestedView)
    : undefined
  if (preferredView) return preferredView.id
  if (!requestedView && preserveCurrentView && currentViewId && views[currentViewId]) return currentViewId
  return Object.keys(views)[0] ?? null
}
