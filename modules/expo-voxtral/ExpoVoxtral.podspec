require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoVoxtral'
  s.version        = package['version']
  s.summary        = 'Expo module wrapping voxtral.cpp for on-device ASR'
  s.description    = 'Native Expo module providing Voxtral Realtime 4B speech-to-text via ggml'
  s.homepage       = 'https://github.com/andrijdavid/voxtral.cpp'
  s.license        = package['license']
  s.author         = package['author']
  s.platform       = :ios, '15.1'

  s.source         = { git: '' }
  s.static_framework = true

  # ── Swift + ObjC++ bridge ──────────────────────────────────────────
  # Podspec is at module root, so ios/ and cpp/ are both direct children
  s.source_files = [
    'ios/**/*.{swift,h,mm,m}',
  ]

  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'GCC_PREPROCESSOR_DEFINITIONS' => [
      '$(inherited)',
      'GGML_USE_METAL=1',
      'GGML_USE_CPU=1',
      'ACCELERATE_NEW_LAPACK=1',
      'ACCELERATE_LAPACK_ILP64=1',
      'GGML_VERSION=\"0.9.6\"',
      'GGML_COMMIT=\"unknown\"',
    ].join(' '),
    'OTHER_CFLAGS' => '$(inherited) -Wno-shorten-64-to-32 -Wno-comma -Wno-unreachable-code -Wno-conditional-uninitialized',
    'OTHER_CPLUSPLUSFLAGS' => '$(inherited) -Wno-shorten-64-to-32 -Wno-comma -Wno-unreachable-code -Wno-conditional-uninitialized',
    'HEADER_SEARCH_PATHS' => [
      '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/include"',
      '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/include"',
      '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/src"',
      '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/src/ggml-cpu"',
      '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/src/ggml-metal"',
    ].join(' '),
  }

  # Keep all C/C++ headers private so they aren't verified as public (C) headers
  s.private_header_files = [
    'cpp/**/*.h',
  ]

  # ── Frameworks ─────────────────────────────────────────────────────
  s.frameworks = ['Metal', 'MetalKit', 'Accelerate', 'Foundation']

  # ── Dependencies ───────────────────────────────────────────────────
  s.dependency 'ExpoModulesCore'

  # ── Vendored C++ sources via subspecs ──────────────────────────────

  # voxtral.cpp main library
  s.subspec 'voxtral' do |vs|
    vs.source_files = [
      'cpp/voxtral.cpp/src/voxtral.cpp',
      'cpp/voxtral.cpp/include/**/*.h',
    ]
    vs.private_header_files = 'cpp/voxtral.cpp/include/**/*.h'
    vs.header_mappings_dir = 'cpp/voxtral.cpp/include'
    vs.pod_target_xcconfig = {
      'HEADER_SEARCH_PATHS' => [
        '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/include"',
        '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/include"',
        '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/src"',
      ].join(' '),
    }
  end

  # ggml core
  s.subspec 'ggml-core' do |gc|
    gc.source_files = [
      'cpp/voxtral.cpp/ggml/src/ggml.c',
      'cpp/voxtral.cpp/ggml/src/ggml.cpp',
      'cpp/voxtral.cpp/ggml/src/gguf.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-alloc.c',
      'cpp/voxtral.cpp/ggml/src/ggml-backend.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-backend-reg.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-opt.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-quants.c',
      'cpp/voxtral.cpp/ggml/src/ggml-threading.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-common.h',
      'cpp/voxtral.cpp/ggml/src/ggml-impl.h',
      'cpp/voxtral.cpp/ggml/src/ggml-threading.h',
      'cpp/voxtral.cpp/ggml/src/ggml-backend-impl.h',
      'cpp/voxtral.cpp/ggml/include/**/*.h',
    ]
    gc.private_header_files = [
      'cpp/voxtral.cpp/ggml/src/**/*.h',
      'cpp/voxtral.cpp/ggml/include/**/*.h',
    ]
    gc.pod_target_xcconfig = {
      'HEADER_SEARCH_PATHS' => [
        '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/include"',
        '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/src"',
      ].join(' '),
    }
  end

  # ggml CPU backend
  s.subspec 'ggml-cpu' do |cpu|
    cpu.source_files = [
      'cpp/voxtral.cpp/ggml/src/ggml-cpu/ggml-cpu.c',
      'cpp/voxtral.cpp/ggml/src/ggml-cpu/ggml-cpu.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-cpu/ops.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-cpu/binary-ops.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-cpu/unary-ops.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-cpu/vec.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-cpu/quants.c',
      'cpp/voxtral.cpp/ggml/src/ggml-cpu/repack.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-cpu/hbm.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-cpu/traits.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-cpu/llamafile/sgemm.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-cpu/arch/arm/*.{cpp,c}',
      'cpp/voxtral.cpp/ggml/src/ggml-cpu/**/*.h',
    ]
    cpu.private_header_files = 'cpp/voxtral.cpp/ggml/src/ggml-cpu/**/*.h'
    cpu.pod_target_xcconfig = {
      'HEADER_SEARCH_PATHS' => [
        '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/include"',
        '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/src"',
        '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/src/ggml-cpu"',
      ].join(' '),
    }
    cpu.dependency "ExpoVoxtral/ggml-core"
  end

  # ggml Metal backend
  s.subspec 'ggml-metal' do |mtl|
    mtl.requires_arc = false
    mtl.source_files = [
      'cpp/voxtral.cpp/ggml/src/ggml-metal/ggml-metal.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-metal/ggml-metal-common.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-metal/ggml-metal-device.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-metal/ggml-metal-ops.cpp',
      'cpp/voxtral.cpp/ggml/src/ggml-metal/ggml-metal-device.m',
      'cpp/voxtral.cpp/ggml/src/ggml-metal/ggml-metal-context.m',
      'cpp/voxtral.cpp/ggml/src/ggml-metal/**/*.h',
    ]
    mtl.private_header_files = 'cpp/voxtral.cpp/ggml/src/ggml-metal/**/*.h'
    mtl.resources = [
      'cpp/voxtral.cpp/ggml/src/ggml-metal/ggml-metal.metal',
    ]
    mtl.compiler_flags = '-fno-objc-arc -Wno-error=incompatible-pointer-types'
    mtl.pod_target_xcconfig = {
      'HEADER_SEARCH_PATHS' => [
        '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/include"',
        '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/src"',
        '"$(PODS_TARGET_SRCROOT)/cpp/voxtral.cpp/ggml/src/ggml-metal"',
      ].join(' '),
    }
    mtl.frameworks = ['Metal', 'MetalKit']
    mtl.dependency "ExpoVoxtral/ggml-core"
  end
end
