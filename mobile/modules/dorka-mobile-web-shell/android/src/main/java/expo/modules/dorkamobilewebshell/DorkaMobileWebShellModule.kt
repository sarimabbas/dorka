package expo.modules.dorkamobilewebshell

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DorkaMobileWebShellModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DorkaMobileWebShell")

    View(DorkaMobileWebShellView::class) {
      Events("onLoadState", "onBridgeMessage", "onExternalNavigation")

      Prop("generationDirectory") { view: DorkaMobileWebShellView, value: String ->
        view.setGenerationDirectory(value)
      }

      Prop("sessionId") { view: DorkaMobileWebShellView, value: String ->
        view.setSessionId(value)
      }

      Prop("bridgeEnabled") { view: DorkaMobileWebShellView, value: Boolean ->
        view.setBridgeEnabled(value)
      }

      AsyncFunction("postBridgeMessage") { view: DorkaMobileWebShellView, json: String ->
        view.postBridgeMessage(json)
      }

      OnViewDidUpdateProps { view: DorkaMobileWebShellView ->
        view.propsDidUpdate()
      }

      OnViewDestroys { view: DorkaMobileWebShellView ->
        view.destroyWebView()
      }
    }
  }
}
