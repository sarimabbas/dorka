import { createRoot, type Root } from 'react-dom/client'

type RendererRootHotData = {
  dorkaRendererRoot?: Root
}

export function getOrCreateRendererRoot(
  container: HTMLElement,
  hotData?: RendererRootHotData
): Root {
  const existingRoot = hotData?.dorkaRendererRoot
  if (existingRoot) {
    return existingRoot
  }
  const root = createRoot(container)
  if (hotData) {
    hotData.dorkaRendererRoot = root
  }
  return root
}
