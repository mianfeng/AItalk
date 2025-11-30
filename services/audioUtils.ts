
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
 * Gets the best available English voice.
 * Priorities: 
 * 1. User saved preference (URI)
 * 2. Mobile High Quality (Premium, Enhanced, Siri)
 * 3. Google/Microsoft Online Voices
 * 4. Standard en-US
 */
export function getPreferredVoice(voices: SpeechSynthesisVoice[], savedVoiceURI?: string | null): SpeechSynthesisVoice | null {
  if (savedVoiceURI) {
    const saved = voices.find(v => v.voiceURI === savedVoiceURI);
    if (saved) return saved;
  }

  // Filter for English voices first to avoid iterating all
  const englishVoices = voices.filter(v => v.lang.startsWith('en'));

  // 1. iOS/Mac High Quality (Samantha Enhanced, Daniel Enhanced, Siri)
  const iosPremium = englishVoices.find(v => 
    (v.name.includes('Premium') || v.name.includes('Enhanced') || v.name.includes('Siri')) && v.lang.includes('US')
  );
  if (iosPremium) return iosPremium;

  // 2. Google Voices (Android/Chrome) - "Google US English" is usually the best online one
  const googleBest = englishVoices.find(v => v.name === 'Google US English');
  if (googleBest) return googleBest;

  // 3. Microsoft Voices (Edge/Windows)
  const msBest = englishVoices.find(v => (v.name.includes('Zira') || v.name.includes('David')) && v.lang.includes('US'));
  if (msBest) return msBest;

  // 4. Any US English
  const anyUS = englishVoices.find(v => v.lang === 'en-US');
  if (anyUS) return anyUS;

  // 5. Any English
  return englishVoices[0] || null;
}
