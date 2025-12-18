
/**
 * Decodes base64 string to raw bytes.
 */
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes Uint8Array to base64 string.
 */
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decodes raw PCM data into an AudioBuffer.
 * Gemini Live API usually sends 24kHz PCM.
 */
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert Int16 (-32768 to 32767) to Float32 (-1.0 to 1.0)
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Creates a PCM audio blob for Gemini Live API from Float32Array (AudioBuffer channel data).
 */
export function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

/**
 * Wraps raw PCM data in a WAV header to make it a playable Blob.
 */
export function pcmToWav(base64Pcm: string, sampleRate: number = 24000): Blob {
  const rawPcm = decode(base64Pcm);
  const buffer = new ArrayBuffer(44 + rawPcm.length);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 32 + rawPcm.length, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, rawPcm.length, true);

  // Write PCM data
  const pcmBytes = new Uint8Array(buffer, 44);
  pcmBytes.set(rawPcm);

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Plays raw PCM audio (24kHz mono) from a base64 string.
 * Used for Gemini TTS playback.
 */
export async function playAudioFromBase64(base64String: string): Promise<void> {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const bytes = decode(base64String);
    const buffer = await decodeAudioData(bytes, audioContext, 24000, 1);
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);

    return new Promise((resolve) => {
      source.onended = () => {
        resolve();
        audioContext.close();
      };
    });
  } catch (error) {
    console.error("Error playing audio:", error);
  }
}

// --- Browser TTS Utilities ---

/**
 * Gets the best available English voice with high-quality preference.
 */
export function getPreferredVoice(voices: SpeechSynthesisVoice[], savedVoiceURI?: string | null): SpeechSynthesisVoice | null {
  if (savedVoiceURI) {
    const saved = voices.find(v => v.voiceURI === savedVoiceURI);
    if (saved) return saved;
  }

  const englishVoices = voices.filter(v => v.lang.startsWith('en'));

  // 1. Prioritize Premium/Enhanced voices (often much higher quality on mobile)
  const premium = englishVoices.find(v => 
    (v.name.includes('Premium') || v.name.includes('Enhanced') || v.name.includes('Natural')) && v.lang.includes('US')
  );
  if (premium) return premium;

  // 2. Specific mobile favorites (Siri is usually the best on iOS)
  const siri = englishVoices.find(v => v.name.includes('Siri') && v.lang.includes('US'));
  if (siri) return siri;

  // 3. Google High Quality
  const googleBest = englishVoices.find(v => v.name === 'Google US English');
  if (googleBest) return googleBest;

  // 4. Default Microsoft/System fallbacks
  const msBest = englishVoices.find(v => (v.name.includes('Zira') || v.name.includes('David')) && v.lang.includes('US'));
  if (msBest) return msBest;

  const anyUS = englishVoices.find(v => v.lang === 'en-US');
  if (anyUS) return anyUS;

  return englishVoices[0] || null;
}
