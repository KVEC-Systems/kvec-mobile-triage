package expo.modules.voxtral

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ExpoVoxtralModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoVoxtral")

    AsyncFunction("loadModel") { modelPath: String, threads: Int, useGpu: Boolean, promise: Promise ->
      promise.reject("ERR_NOT_IMPLEMENTED", "Voxtral is not yet implemented on Android", null)
    }

    AsyncFunction("transcribe") { audioPath: String, promise: Promise ->
      promise.reject("ERR_NOT_IMPLEMENTED", "Voxtral is not yet implemented on Android", null)
    }

    AsyncFunction("releaseModel") { promise: Promise ->
      promise.resolve(null)
    }

    Function("isModelLoaded") {
      false
    }
  }
}
