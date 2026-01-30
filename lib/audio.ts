/**
 * Audio Utilities
 * WAV parsing and audio preprocessing for ASR
 */

import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * WAV file header structure
 */
interface WavHeader {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
}

/**
 * Parse WAV file header from base64 data
 */
function parseWavHeader(base64Data: string): WavHeader {
  // Decode base64 to bytes
  const binaryString = atob(base64Data.substring(0, 100)); // Just need first 100 bytes for header
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Read little-endian values
  const readUint16 = (offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
  const readUint32 = (offset: number) => 
    bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
  
  // Verify RIFF header
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const wave = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  
  console.log('[Audio] File header:', riff, 'Format:', wave);
  console.log('[Audio] First 16 bytes:', Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));
  
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error(`Not a valid WAV file. Got header: "${riff}" format: "${wave}". Android may be recording in M4A format.`);
  }
  
  // Find fmt chunk
  let offset = 12;
  let numChannels = 1;
  let sampleRate = 16000;
  let bitsPerSample = 16;
  let dataOffset = 44;
  let dataSize = 0;
  
  while (offset < bytes.length - 8) {
    const chunkId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const chunkSize = readUint32(offset + 4);
    
    if (chunkId === 'fmt ') {
      numChannels = readUint16(offset + 10);
      sampleRate = readUint32(offset + 12);
      bitsPerSample = readUint16(offset + 22);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    
    offset += 8 + chunkSize;
  }
  
  return { sampleRate, numChannels, bitsPerSample, dataOffset, dataSize };
}

/**
 * Convert WAV audio data to float32 array normalized to [-1, 1]
 */
function wavToFloat32(base64Data: string, header: WavHeader): Float32Array {
  // Decode base64 to bytes
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const numSamples = Math.floor(header.dataSize / (header.bitsPerSample / 8) / header.numChannels);
  const audioData = new Float32Array(numSamples);
  
  let sampleIndex = 0;
  let byteOffset = header.dataOffset;
  
  for (let i = 0; i < numSamples; i++) {
    // Read sample(s) and average channels to mono
    let sampleSum = 0;
    for (let ch = 0; ch < header.numChannels; ch++) {
      if (header.bitsPerSample === 16) {
        // 16-bit signed PCM
        const low = bytes[byteOffset];
        const high = bytes[byteOffset + 1];
        let sample = low | (high << 8);
        if (sample >= 32768) sample -= 65536; // Convert to signed
        sampleSum += sample / 32768.0; // Normalize to [-1, 1]
        byteOffset += 2;
      } else if (header.bitsPerSample === 8) {
        // 8-bit unsigned PCM
        const sample = bytes[byteOffset];
        sampleSum += (sample - 128) / 128.0;
        byteOffset += 1;
      }
    }
    audioData[sampleIndex++] = sampleSum / header.numChannels;
  }
  
  return audioData;
}

/**
 * Simple linear resampling
 */
function resample(audioData: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) {
    return audioData;
  }
  
  const ratio = fromRate / toRate;
  const newLength = Math.floor(audioData.length / ratio);
  const resampled = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, audioData.length - 1);
    const fraction = srcIndex - srcIndexFloor;
    
    // Linear interpolation
    resampled[i] = audioData[srcIndexFloor] * (1 - fraction) + audioData[srcIndexCeil] * fraction;
  }
  
  return resampled;
}

/**
 * Load and preprocess audio file for ASR
 * Converts to 16kHz mono float32
 */
export async function preprocessAudioForASR(audioUri: string): Promise<Float32Array> {
  console.log('[Audio] Loading audio file:', audioUri);
  
  // Read file as base64
  const base64Data = await FileSystem.readAsStringAsync(audioUri, {
    encoding: EncodingType.Base64,
  });
  
  console.log('[Audio] File loaded, size:', base64Data.length, 'bytes (base64)');
  
  // Parse WAV header
  const header = parseWavHeader(base64Data);
  console.log('[Audio] WAV header:', header);
  
  // Convert to float32
  let audioData = wavToFloat32(base64Data, header);
  console.log('[Audio] Converted to float32, samples:', audioData.length);
  
  // Resample to 16kHz if needed
  const targetSampleRate = 16000;
  if (header.sampleRate !== targetSampleRate) {
    console.log(`[Audio] Resampling from ${header.sampleRate}Hz to ${targetSampleRate}Hz`);
    audioData = resample(audioData, header.sampleRate, targetSampleRate);
    console.log('[Audio] Resampled, new samples:', audioData.length);
  }
  
  return audioData;
}

/**
 * Get recording options for 16kHz mono WAV
 */
export const ASR_RECORDING_OPTIONS = {
  isMeteringEnabled: false,
  android: {
    extension: '.wav',
    outputFormat: 2, // MPEG_4 won't work, use default
    audioEncoder: 1, // Default
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
  },
  ios: {
    extension: '.wav',
    outputFormat: 'lpcm' as const,
    audioQuality: 127,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {},
};
