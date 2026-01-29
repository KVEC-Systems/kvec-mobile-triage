package expo.modules.litertlm

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.SamplerConfig
import kotlinx.coroutines.*

private const val TAG = "LiteRTLM"

class LiteRTLMModule : Module() {
    private var engine: Engine? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun definition() = ModuleDefinition {
        Name("LiteRTLM")

        Events("onLog", "onError")

        // Initialize engine with model path
        AsyncFunction("createEngine") { modelPath: String, promise: Promise ->
            scope.launch {
                try {
                    sendEvent("onLog", mapOf("message" to "Creating engine: $modelPath"))
                    
                    val config = EngineConfig(
                        modelPath = modelPath,
                        backend = Backend.CPU,
                        cacheDir = appContext.reactContext?.cacheDir?.path
                    )
                    
                    engine = Engine(config)
                    engine?.initialize()
                    
                    sendEvent("onLog", mapOf("message" to "Engine initialized"))
                    withContext(Dispatchers.Main) { promise.resolve(true) }
                } catch (e: Exception) {
                    Log.e(TAG, "Engine creation failed: ${e.message}", e)
                    sendEvent("onError", mapOf("error" to (e.message ?: "Unknown")))
                    withContext(Dispatchers.Main) {
                        promise.reject("ENGINE_FAILED", e.message, e)
                    }
                }
            }
        }

        // Generate response
        AsyncFunction("generateResponse") { prompt: String, promise: Promise ->
            scope.launch {
                try {
                    val eng = engine ?: run {
                        withContext(Dispatchers.Main) {
                            promise.reject("NO_ENGINE", "Not initialized", null)
                        }
                        return@launch
                    }

                    val convConfig = ConversationConfig(
                        samplerConfig = SamplerConfig(topK = 40, topP = 0.95f, temperature = 0.7f)
                    )
                    
                    val conv = eng.createConversation(convConfig)
                    val response = conv.sendMessage(prompt)
                    conv.close()
                    
                    withContext(Dispatchers.Main) { promise.resolve(response.toString()) }
                } catch (e: Exception) {
                    Log.e(TAG, "Generation failed: ${e.message}", e)
                    withContext(Dispatchers.Main) {
                        promise.reject("GENERATE_FAILED", e.message, e)
                    }
                }
            }
        }

        // Release resources
        AsyncFunction("releaseEngine") { promise: Promise ->
            try {
                engine?.close()
                engine = null
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("RELEASE_FAILED", e.message, e)
            }
        }

        Function("isInitialized") { engine != null }
    }
}
