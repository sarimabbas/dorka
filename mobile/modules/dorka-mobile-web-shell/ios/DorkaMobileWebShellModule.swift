import ExpoModulesCore

public class DorkaMobileWebShellModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DorkaMobileWebShell")

    View(DorkaMobileWebShellView.self) {
      Events("onLoadState", "onBridgeMessage", "onExternalNavigation")

      Prop("generationDirectory") { (view: DorkaMobileWebShellView, value: String) in
        view.setGenerationDirectory(value)
      }

      Prop("sessionId") { (view: DorkaMobileWebShellView, value: String) in
        view.setSessionId(value)
      }

      Prop("bridgeEnabled") { (view: DorkaMobileWebShellView, value: Bool) in
        view.setBridgeEnabled(value)
      }

      AsyncFunction("postBridgeMessage") {
        (view: DorkaMobileWebShellView, json: String, promise: Promise) in
        try view.postBridgeMessage(json, promise: promise)
      }

      OnViewDidUpdateProps { (view: DorkaMobileWebShellView) in
        view.propsDidUpdate()
      }
    }
  }
}
