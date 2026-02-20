import ExpoModulesCore

public class ExpoVoxtralModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoVoxtral")

    AsyncFunction("loadModel") { (modelPath: String, threads: Int, useGpu: Bool, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let result = VoxtralBridge.shared.loadModel(path: modelPath, threads: Int32(threads), useGpu: useGpu)
        promise.resolve(result)
      }
    }

    AsyncFunction("transcribe") { (audioPath: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard VoxtralBridge.shared.isLoaded() else {
          promise.reject("ERR_NOT_LOADED", "Voxtral model is not loaded. Call loadModel() first.")
          return
        }
        if let text = VoxtralBridge.shared.transcribe(audioPath: audioPath) {
          promise.resolve(text)
        } else {
          promise.reject("ERR_TRANSCRIPTION", "Transcription failed.")
        }
      }
    }

    AsyncFunction("releaseModel") { (promise: Promise) in
      VoxtralBridge.shared.releaseModel()
      promise.resolve(nil)
    }

    Function("isModelLoaded") { () -> Bool in
      return VoxtralBridge.shared.isLoaded()
    }
  }
}
