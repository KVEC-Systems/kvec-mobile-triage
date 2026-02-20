#import "VoxtralBridge.h"
#include "voxtral.h"
#include <string>

@implementation VoxtralBridge {
    voxtral_model *_model;
    voxtral_context *_context;
    int32_t _threads;
    BOOL _useGpu;
}

+ (VoxtralBridge *)shared {
    static VoxtralBridge *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[VoxtralBridge alloc] init];
    });
    return instance;
}

- (instancetype)init {
    self = [super init];
    if (self) {
        _model = nullptr;
        _context = nullptr;
        _threads = 4;
        _useGpu = YES;
    }
    return self;
}

- (BOOL)loadModelWithPath:(NSString *)path threads:(int32_t)threads useGpu:(BOOL)useGpu {
    // Release any previously loaded model
    [self releaseModel];

    _threads = threads;
    _useGpu = useGpu;

    std::string modelPath = [path UTF8String];

    // Logger callback
    voxtral_log_callback logger = [](voxtral_log_level level, const std::string &msg) {
        const char *levelStr = "INFO";
        switch (level) {
            case voxtral_log_level::error: levelStr = "ERROR"; break;
            case voxtral_log_level::warn:  levelStr = "WARN";  break;
            case voxtral_log_level::info:  levelStr = "INFO";  break;
            case voxtral_log_level::debug: levelStr = "DEBUG"; break;
        }
        NSLog(@"[Voxtral/%s] %s", levelStr, msg.c_str());
    };

    // Choose GPU backend
    voxtral_gpu_backend gpu = useGpu ? voxtral_gpu_backend::metal : voxtral_gpu_backend::none;

    NSLog(@"[Voxtral] Loading model from: %@", path);
    _model = voxtral_model_load_from_file(modelPath, logger, gpu);

    if (!_model) {
        NSLog(@"[Voxtral] Failed to load model");
        return NO;
    }

    // Create context
    voxtral_context_params params;
    params.n_threads = threads;
    params.log_level = voxtral_log_level::info;
    params.logger = logger;
    params.gpu = gpu;

    _context = voxtral_init_from_model(_model, params);

    if (!_context) {
        NSLog(@"[Voxtral] Failed to create context");
        voxtral_model_free(_model);
        _model = nullptr;
        return NO;
    }

    NSLog(@"[Voxtral] Model loaded successfully (threads=%d, gpu=%@)", threads, useGpu ? @"metal" : @"none");
    return YES;
}

- (NSString * _Nullable)transcribeWithAudioPath:(NSString *)audioPath {
    if (!_context) {
        NSLog(@"[Voxtral] Cannot transcribe: no context loaded");
        return nil;
    }

    std::string path = [audioPath UTF8String];
    voxtral_result result;

    NSLog(@"[Voxtral] Transcribing: %@", audioPath);

    bool success = voxtral_transcribe_file(*_context, path, 4096, result);

    if (!success) {
        NSLog(@"[Voxtral] Transcription failed for: %@", audioPath);
        return nil;
    }

    NSString *text = [NSString stringWithUTF8String:result.text.c_str()];
    NSLog(@"[Voxtral] Transcription complete: %@", [text substringToIndex:MIN(text.length, 80)]);
    return text;
}

- (void)releaseModel {
    if (_context) {
        voxtral_free(_context);
        _context = nullptr;
    }
    if (_model) {
        voxtral_model_free(_model);
        _model = nullptr;
    }
    NSLog(@"[Voxtral] Model released");
}

- (BOOL)isLoaded {
    return _model != nullptr && _context != nullptr;
}

- (void)dealloc {
    [self releaseModel];
}

@end
