import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Play, Pause, Mic, Square, Volume2, RefreshCcw, Sparkles, Loader2, CheckCircle, RotateCcw, Info, ArrowRight, Gauge, Zap, AlertCircle } from 'lucide-react';
import { generateSpeech, evaluatePronunciation } from '../services/contentGen';
import { pcmToWav, getPreferredVoice } from '../services/audioUtils';

interface ShadowingModeProps {
  onBack: () => void;
}

export const ShadowingMode: React.FC<ShadowingModeProps> = ({ onBack }) => {
  const [inputText, setInputText] = useState('');
  const [practiceText, setPracticeText] = useState('');
  const [state, setState] = useState<'input' | 'practice' | 'processing' | 'result'>('input');
  
  // Voice Mode: 'local' (instant) or 'ai' (quality)
  const [voiceMode, setVoiceMode] = useState<'local' | 'ai'>('local');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [preferredVoice, setPreferredVoice] = useState<SpeechSynthesisVoice | null>(null);
  
  // Audio State
  const [aiAudioUrl, setAiAudioUrl] = useState<string | null>(null);
  const [aiIsLoading, setAiIsLoading] = useState(false);
  const [aiIsPlaying, setAiIsPlaying] = useState(false);
  const [aiCurrentTime, setAiCurrentTime] = useState(0);
  const [aiDuration, setAiDuration] = useState(0);
  const [aiSpeed, setAiSpeed] = useState(1.0);
  
  // Local Mode specific
  const [localProgress, setLocalProgress] = useState(0); // 0 to 100
  const localCharOffsetRef = useRef(0);
  const isSeekingRef = useRef(false);
  
  // User Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [evaluation, setEvaluation] = useState<{ score: number, feedback: string } | null>(null);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
  
  const aiAudioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const userAudioRef = useRef<HTMLAudioElement>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  // Initialize Voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      const best = getPreferredVoice(voices, localStorage.getItem('lingua_voice_uri'));
      setPreferredVoice(best);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const stopAllRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => track.stop());
      activeStreamRef.current = null;
    }
    setIsRecording(false);
  };

  const resetSession = () => {
    stopAllRecording();
    window.speechSynthesis.cancel();
    if (aiAudioUrl) URL.revokeObjectURL(aiAudioUrl);
    if (userAudioUrl) URL.revokeObjectURL(userAudioUrl);
    setAiAudioUrl(null);
    setUserAudioUrl(null);
    setEvaluation(null);
    setAiIsPlaying(false);
    setAiCurrentTime(0);
    setLocalProgress(0);
    localCharOffsetRef.current = 0;
    setState('input');
  };

  const handleStartPractice = () => {
    if (!inputText.trim()) return;
    setPracticeText(inputText);
    setState('practice');
    setAiAudioUrl(null);
    setLocalProgress(0);
    localCharOffsetRef.current = 0;
  };

  const loadAiAudio = async () => {
    if (aiAudioUrl || aiIsLoading) return;
    setAiIsLoading(true);
    try {
      const base64 = await generateSpeech(practiceText);
      if (base64) {
        const wavBlob = pcmToWav(base64, 24000);
        const url = URL.createObjectURL(wavBlob);
        setAiAudioUrl(url);
        return url;
      } else {
        alert("AI语音生成失败，请尝试使用极速模式");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiIsLoading(false);
    }
    return null;
  };

  const startLocalSpeech = (startIndex: number) => {
    window.speechSynthesis.cancel();
    const remainingText = practiceText.substring(startIndex);
    if (!remainingText.trim()) {
      setAiIsPlaying(false);
      setLocalProgress(100);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(remainingText);
    utterance.lang = 'en-US';
    utterance.rate = aiSpeed;
    
    // Use high quality voice if detected
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    // Tweak pitch slightly for more natural feel on some mobile engines
    utterance.pitch = 1.0; 
    
    utterance.onboundary = (event) => {
      if (event.name === 'word' && !isSeekingRef.current) {
        const absoluteCharIndex = startIndex + event.charIndex;
        const progress = (absoluteCharIndex / practiceText.length) * 100;
        setLocalProgress(progress);
        localCharOffsetRef.current = absoluteCharIndex;
      }
    };
    
    utterance.onend = () => {
      if (!isSeekingRef.current) {
        setAiIsPlaying(false);
        setLocalProgress(100);
        localCharOffsetRef.current = 0;
      }
    };

    utterance.onerror = () => {
        setAiIsPlaying(false);
    };

    setAiIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  };

  const toggleAiPlay = async () => {
    if (voiceMode === 'local') {
      if (aiIsPlaying) {
        window.speechSynthesis.cancel();
        setAiIsPlaying(false);
      } else {
        const startFrom = localProgress >= 99 ? 0 : localCharOffsetRef.current;
        if (startFrom === 0) setLocalProgress(0);
        startLocalSpeech(startFrom);
      }
      return;
    }

    if (!aiAudioUrl) {
      const url = await loadAiAudio();
      if (url && aiAudioRef.current) {
         setTimeout(() => aiAudioRef.current?.play(), 100);
      }
      return;
    }

    if (aiIsPlaying) {
      aiAudioRef.current?.pause();
    } else {
      aiAudioRef.current?.play();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    
    if (voiceMode === 'local') {
      isSeekingRef.current = true;
      setLocalProgress(val);
      const charIndex = Math.floor((val / 100) * practiceText.length);
      localCharOffsetRef.current = charIndex;
      if (aiIsPlaying) {
        startLocalSpeech(charIndex);
      }
      isSeekingRef.current = false;
    } else {
      if (aiAudioRef.current) {
        aiAudioRef.current.currentTime = val;
        setAiCurrentTime(val);
      }
    }
  };

  useEffect(() => {
    if (aiAudioRef.current) {
      aiAudioRef.current.playbackRate = aiSpeed;
    }
    if (voiceMode === 'local' && aiIsPlaying) {
        startLocalSpeech(localCharOffsetRef.current);
    }
  }, [aiSpeed]);

  const toggleAiSpeed = () => {
    const speeds = [1.0, 0.8, 0.6];
    const currentIndex = speeds.indexOf(aiSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    setAiSpeed(speeds[nextIndex]);
  };

  const toggleRecording = async () => {
    if (aiIsPlaying) {
        if (voiceMode === 'local') window.speechSynthesis.cancel();
        else aiAudioRef.current?.pause();
        setAiIsPlaying(false);
    }

    if (isRecording) {
      stopAllRecording();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        activeStreamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          setState('processing');
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const url = URL.createObjectURL(blob);
          setUserAudioUrl(url);

          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1];
            const res = await evaluatePronunciation(base64, practiceText);
            setEvaluation(res);
            setState('result');
          };
          stream.getTracks().forEach(t => t.stop());
          activeStreamRef.current = null;
        };

        recorder.start();
        setIsRecording(true);
      } catch (e) {
        alert("无法访问麦克风，请检查浏览器权限设置");
      }
    }
  };

  const isLowQualityVoice = preferredVoice && !preferredVoice.name.match(/Enhanced|Premium|Siri|Natural|Google/i);

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200 overflow-y-auto">
      {/* Header */}
      <div className="h-16 shrink-0 border-b border-slate-900 bg-slate-950 flex items-center px-4 sticky top-0 z-20">
        <button 
          onClick={state === 'input' ? onBack : resetSession}
          className="mr-4 p-2 -ml-2 rounded-full hover:bg-slate-900 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-bold">跟读练习</h2>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full flex flex-col gap-4 pb-32">
        
        {/* VIEW: INPUT TEXT */}
        {state === 'input' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-indigo-900/10 border border-indigo-500/20 p-4 rounded-xl flex items-start gap-3">
              <Info className="text-indigo-400 shrink-0 mt-1" size={18} />
              <p className="text-sm text-indigo-200/70">
                输入练习句子。<b>极速模式</b>零加载，支持拖动进度条重复听细节。
              </p>
            </div>
            
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="输入英语台词..."
              className="w-full h-40 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-slate-100 text-lg placeholder:text-slate-600 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500/50 outline-none transition-all resize-none"
            />

            <button
              onClick={handleStartPractice}
              disabled={!inputText.trim()}
              className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              开始练习 <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* VIEW: PRACTICE & RESULT */}
        {(state === 'practice' || state === 'processing' || state === 'result') && (
          <div className="space-y-4 animate-in fade-in zoom-in-95">
            
            {/* The Text Card & Player Controls - Integrated for ergonomics */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden shadow-2xl">
              
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-tighter">示范文本</span>
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 scale-90">
                    <button 
                        onClick={() => { setVoiceMode('local'); window.speechSynthesis.cancel(); setAiIsPlaying(false); }}
                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all flex items-center gap-1 ${voiceMode === 'local' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
                    >
                        <Zap size={10} /> 极速
                    </button>
                    <button 
                        onClick={() => setVoiceMode('ai')}
                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all flex items-center gap-1 ${voiceMode === 'ai' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}
                    >
                        <Volume2 size={10} /> AI
                    </button>
                </div>
              </div>

              {/* Click text to Play/Pause */}
              <div 
                onClick={toggleAiPlay}
                className={`text-xl md:text-2xl font-medium text-center leading-relaxed mb-6 cursor-pointer select-none transition-colors duration-300 ${aiIsPlaying ? 'text-blue-400' : 'text-slate-100'}`}
              >
                {practiceText}
              </div>

              {/* Quality Hint */}
              {voiceMode === 'local' && isLowQualityVoice && (
                <div className="mb-4 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg flex items-center gap-2">
                    <AlertCircle size={12} className="text-amber-500 shrink-0" />
                    <span className="text-[9px] text-amber-200/70 leading-tight">检测到当前为基础语音。如需更自然的发音，请在手机系统设置中下载“增强版(Enhanced)”英语语音包。</span>
                </div>
              )}

              {/* PLAYER BAR - High positioning for thumb reach */}
              <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-2xl">
                 <div className="flex flex-col gap-4">
                    {/* Progress Slider (Unified for both modes) */}
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-slate-500 w-8">
                            {voiceMode === 'ai' ? Math.floor(aiCurrentTime) : Math.floor((localProgress / 100) * practiceText.length)}
                        </span>
                        <input 
                            type="range" 
                            min="0" 
                            max={voiceMode === 'ai' ? (aiDuration || 100) : 100} 
                            step={voiceMode === 'ai' ? "0.01" : "0.1"}
                            value={voiceMode === 'ai' ? aiCurrentTime : localProgress}
                            onChange={handleSeek}
                            className={`flex-1 h-1.5 rounded-lg appearance-none cursor-pointer ${voiceMode === 'local' ? 'accent-indigo-500 bg-indigo-900/20' : 'accent-blue-500 bg-blue-900/20'}`}
                        />
                        <span className="text-[10px] font-mono text-slate-500 w-8 text-right">
                            {voiceMode === 'ai' ? Math.floor(aiDuration) : practiceText.length}
                        </span>
                    </div>

                    <div className="flex items-center justify-between">
                        <button 
                            onClick={toggleAiSpeed}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-400 transition-colors border border-slate-800"
                        >
                            <Gauge size={14} />
                            <span>{aiSpeed}x</span>
                        </button>

                        <button
                            onClick={toggleAiPlay}
                            disabled={aiIsLoading}
                            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95 ${
                                aiIsLoading ? 'bg-slate-800 text-slate-600' : 
                                (voiceMode === 'local' ? 'bg-indigo-600 shadow-indigo-900/20' : 'bg-blue-600 shadow-blue-900/20')
                            } text-white`}
                        >
                            {aiIsLoading ? <Loader2 size={24} className="animate-spin" /> : 
                             (aiIsPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />)}
                        </button>

                        <div className="w-[80px] flex justify-end">
                            {voiceMode === 'local' && (
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">极速模式</span>
                                    {preferredVoice && <span className="text-[8px] text-slate-600 truncate max-w-[60px]">{preferredVoice.name}</span>}
                                </div>
                            )}
                        </div>
                    </div>
                 </div>
              </div>

              {/* Hidden Audio Element for AI Mode */}
              {voiceMode === 'ai' && aiAudioUrl && (
                  <audio 
                    ref={aiAudioRef} 
                    src={aiAudioUrl} 
                    onPlay={() => setAiIsPlaying(true)}
                    onPause={() => setAiIsPlaying(false)}
                    onEnded={() => setAiIsPlaying(false)}
                    onTimeUpdate={() => {
                        if (aiAudioRef.current) {
                            setAiCurrentTime(aiAudioRef.current.currentTime);
                            setAiDuration(aiAudioRef.current.duration || 0);
                        }
                    }}
                    onLoadedMetadata={() => setAiDuration(aiAudioRef.current?.duration || 0)}
                  />
              )}
            </div>

            {/* RECORDING / ACTION SECTION */}
            <div className="flex flex-col items-center pt-8">
              
              {state === 'practice' && (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    {isRecording && <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-20"></div>}
                    <button
                      onClick={toggleRecording}
                      className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-all relative z-10 ${
                        isRecording ? 'bg-red-500 text-white' : 'bg-purple-600 text-white hover:scale-105 active:scale-95'
                      }`}
                    >
                      {isRecording ? <Square size={32} fill="currentColor" /> : <Mic size={32} />}
                    </button>
                  </div>
                  <p className="text-slate-400 text-sm font-medium">
                    {isRecording ? '录音中，读完点击停止' : '点我开始录音跟读'}
                  </p>
                </div>
              )}

              {state === 'processing' && (
                <div className="flex flex-col items-center gap-4 py-8">
                   <RefreshCcw className="animate-spin text-purple-500" size={32} />
                   <p className="text-slate-500 font-medium">AI 正在评估你的发音...</p>
                </div>
              )}

              {state === 'result' && evaluation && (
                <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 flex flex-col items-center shadow-2xl">
                     <div className="text-xs text-indigo-400 font-bold uppercase tracking-widest mb-2">得分</div>
                     <div className="text-6xl font-black text-white mb-4 flex items-baseline gap-1">
                        {evaluation.score}<span className="text-xl text-slate-500">/100</span>
                     </div>
                     <div className="w-full bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                        <p className="text-slate-300 text-sm leading-relaxed italic">"{evaluation.feedback}"</p>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => userAudioRef.current?.play()}
                      className="py-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center gap-2 text-slate-300 font-bold active:bg-slate-800"
                    >
                      <Play size={18} /> 回听录音
                    </button>
                    <audio ref={userAudioRef} src={userAudioUrl || ''} className="hidden" />
                    
                    <button
                      onClick={() => {
                        stopAllRecording();
                        setEvaluation(null);
                        setState('practice');
                      }}
                      className="py-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center gap-2 text-slate-300 font-bold active:bg-slate-800"
                    >
                      <RotateCcw size={18} /> 再练一次
                    </button>
                  </div>

                  <button
                    onClick={resetSession}
                    className="w-full py-4 bg-emerald-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-xl active:scale-[0.98]"
                  >
                    <CheckCircle size={18} /> 完成，换个句子
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};