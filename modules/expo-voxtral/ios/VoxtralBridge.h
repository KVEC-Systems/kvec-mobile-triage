#import <Foundation/Foundation.h>

/// Swift-visible Objective-C wrapper around voxtral.cpp C++ API.
/// This is a singleton — one model loaded at a time.
@interface VoxtralBridge : NSObject

@property (class, readonly) VoxtralBridge *shared;

- (BOOL)loadModelWithPath:(NSString *)path threads:(int32_t)threads useGpu:(BOOL)useGpu;
- (NSString * _Nullable)transcribeWithAudioPath:(NSString *)audioPath;
- (void)releaseModel;
- (BOOL)isLoaded;

@end
