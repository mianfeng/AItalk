
import { useState, useEffect, useCallback } from 'react';
import { getPreferredVoice, sanitizeForTTS } from '../services/audioUtils';

export const useSpeech = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [preferredVoice, setPreferredVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [voiceName, setVoiceName] = useState('系统默认');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Initialize voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
      setAvailableVoices(voices);
      
      if (voices.length > 0) {
        const savedURI = localStorage.getItem('lingua_voice_uri');
        const best = getPreferredVoice(voices, savedURI);
        setPreferredVoice(best);
        if (best) setVoiceName(best.name);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const setVoice = useCallback((voiceURI: string) => {
      const voice = availableVoices.find(v => v.voiceURI === voiceURI);
      if (voice) {
          setPreferredVoice(voice);
          setVoiceName(voice.name);
          localStorage.setItem('lingua_voice_uri', voiceURI);
      }
  }, [availableVoices]);

  const speak = useCallback((text: string, rate: number = 1.0, onEnd?: () => void, onBoundary?: (e: SpeechSynthesisEvent) => void) => {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    if (!text) {
        if(onEnd) onEnd();
        return;
    }

    const cleanText = sanitizeForTTS(text);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => setIsPlaying(true);
    
    utterance.onend = () => {
      setIsPlaying(false);
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      // Ignore errors caused by canceling speech to start new speech
      if (e.error === 'interrupted' || e.error === 'canceled') {
          setIsPlaying(false);
          return;
      }
      console.error("TTS Error details:", e.error);
      setIsPlaying(false);
    };

    if (onBoundary) {
        utterance.onboundary = onBoundary;
    }

    // Small timeout to ensure cancel() has processed in some browsers
    setTimeout(() => {
        window.speechSynthesis.speak(utterance);
    }, 10);
    
  }, [preferredVoice]);

  const cancel = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  }, []);

  return {
    isPlaying,
    speak,
    cancel,
    voiceName,
    availableVoices,
    preferredVoice,
    setVoice
  };
};
