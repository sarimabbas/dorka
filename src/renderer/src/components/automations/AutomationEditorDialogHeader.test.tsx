// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dialog } from '@/components/ui/dialog'
import { AutomationEditorDialogHeader } from './AutomationEditorDialogHeader'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('AutomationEditorDialogHeader', () => {
  it('does not offer unsupported external providers when creating an automation', () => {
    act(() => {
      root.render(
        <Dialog open>
          <AutomationEditorDialogHeader
            isEditing={false}
            isEditingExternal={false}
            isHermesCreate={false}
            isCreateMode
            templateOpen={false}
            templates={[]}
            onTemplateOpenChange={vi.fn()}
            onApplyTemplate={vi.fn()}
          />
        </Dialog>
      )
    })

    expect(container.textContent).toContain('Create automation')
    expect(container.textContent).toContain('Use template')
    expect(container.textContent).not.toContain('Hermes')
  })
})
