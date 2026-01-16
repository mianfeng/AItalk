
import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Play, Pause, Mic, Square, Volume2, RefreshCcw, Loader2, CheckCircle, RotateCcw, Info, ArrowRight, Gauge, Zap } from 'lucide-react';
import { generateSpeech, evaluatePronunciation, PronunciationResult } from '../services/contentGen';
import { pcmToWav, sanitizeForTTS } from '../services/audioUtils';
import { useSpeech } from '../hooks/useSpeech';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

interface ShadowingModeProps {
  onBack: () => void;
}

export const ShadowingMode: React.FC<ShadowingModeProps> = ({ onBack }) => {
  const [inputText, setInputText] = useState('');
  const [practiceText, setPracticeText] = useState('');
  // Merged state for view management: input -> practice -> processing -> result
  const [state, setState] = useState<'input' | 'practice' | 'processing' | 'result'>('input');
  
  // Voice Mode: 'local' (instant) or 'ai' (quality)
  const [voiceMode, setVoiceMode] = useState<'local' | 'ai'>('local');
  
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
  
  // Evaluation State
  const [evaluation, setEvaluation] = useState<PronunciationResult | null>(null);
  
  const aiAudioRef = useRef<HTMLAudioElement>(null);
  const userAudioRef = useRef<HTMLAudioElement>(null);

  // Custom Hooks
  const { speak, isPlaying: localSpeechPlaying, cancel: cancelLocalSpeech, voiceName } = useSpeech();
  const { isRecording, startRecording, stopRecording, audioUrl: userAudioUrl } = useAudioRecorder();

  const resetSession = () => {
    cancelLocalSpeech();
    if (aiAudioUrl) URL.revokeObjectURL(aiAudioUrl);
    setAiAudioUrl(null);
    setEvaluation(null);
    setAiIsPlaying(false);
    setAiCurrentTime(0);
    setLocalProgress(0);
    localCharOffsetRef.current = 0;
    setState('input');
  };

  const handleStartPractice = () => {
    if (!inputText.trim()) return;
    const cleaned = sanitizeForTTS(inputText);
    setPracticeText(cleaned);
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
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiIsLoading(false);
    }
    return null;
  };

  const startLocalSpeech = (startIndex: number) => {
    cancelLocalSpeech();
    
    // Slight delay to ensure clean state
    setTimeout(() => {
        const remainingText = practiceText.substring(startIndex);
        if (!remainingText.trim()) {
            setLocalProgress(100);
            return;
        }

        speak(
            remainingText, 
            aiSpeed * 0.95, // Slightly slower for better clarity
            () => { // onEnd
                setAiIsPlaying(false);
                setLocalProgress(100);
                localCharOffsetRef.current = 0;
            },
            (event) => { // onBoundary
                if (event.name === 'word' && !isSeekingRef.current) {
                    const absoluteCharIndex = startIndex + event.charIndex;
                    const progress = (absoluteCharIndex / practiceText.length) * 100;
                    setLocalProgress(progress);
                    localCharOffsetRef.current = absoluteCharIndex;
                }
            }
        );
        setAiIsPlaying(true);
    }, 50);
  };

  const toggleAiPlay = async () => {
    if (voiceMode === 'local') {
      if (aiIsPlaying) {
        cancelLocalSpeech();
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
    // Restart local speech if speed changes while playing
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

  const handleToggleRecording = async () => {
    if (aiIsPlaying) {
        if (voiceMode === 'local') cancelLocalSpeech();
        else aiAudioRef.current?.pause();
        setAiIsPlaying(false);
    }

    if (isRecording) {
        setState('processing');
        try {
            const base64 = await stopRecording();
            const res = await evaluatePronunciation(base64, practiceText);
            setEvaluation(res);
            setState('result');
        } catch(e) {
            console.error(e);
            alert("录音失败，请重试");
            setState('practice');
        }
    } else {
        startRecording();
    }
  };

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
        
        {state === 'input' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-indigo-900/10 border border-indigo-500/20 p-4 rounded-xl flex items-start gap-3">
              <Info className="text-indigo-400 shrink-0 mt-1" size={18} />
              <div className="text-sm text-indigo-200/70">
                输入练习句子。当前使用语音引擎：<b>{voiceName}</b>。
              </div>
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

        {(state === 'practice' || state === 'processing' || state === 'result') && (
          <div className="space-y-4 animate-in fade-in zoom-in-95">
            
            {/* Top Area: Word and Audio Controls */}
            {state !== 'result' && (
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden shadow-2xl">
                    <div className="flex items-center justify-between mb-4">
                        <span className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-tighter">示范文本</span>
                        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 scale-90">
                            <button 
                                onClick={() => { setVoiceMode('local'); cancelLocalSpeech(); setAiIsPlaying(false); }}
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

                    <div 
                        onClick={toggleAiPlay}
                        className={`text-xl md:text-2xl font-medium text-center leading-relaxed mb-6 cursor-pointer select-none transition-colors duration-300 ${aiIsPlaying ? 'text-blue-400' : 'text-slate-100'}`}
                    >
                        {practiceText}
                    </div>

                    <div className="bg-slate-950/50 border border-slate-800 p-4 rounded-2xl">
                        <div className="flex flex-col gap-4">
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

                                <div className="w-[100px] flex justify-end">
                                </div>
                            </div>
                        </div>
                    </div>

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
            )}

            <div className="flex flex-col items-center pt-2">
              
              {state === 'practice' && (
                <div className="flex flex-col items-center gap-4 mt-8">
                  <div className="relative">
                    {isRecording && <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-20"></div>}
                    <button
                      onClick={handleToggleRecording}
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
                  
                  {/* Detailed Result Card */}
                  <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden">
                      {/* Decorative bg */}
                      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

                      {/* Header with Word & IPA */}
                      <div className="mb-6 flex items-baseline justify-between border-b border-slate-800/50 pb-4">
                         <div>
                             <h2 className="text-4xl font-bold text-white tracking-tight break-words pr-2 font-serif">{practiceText}</h2>
                             {evaluation.ipa && (
                                <div className="flex items-center gap-3 mt-2 text-indigo-400">
                                    <Volume2 size={20} className="cursor-pointer hover:text-white transition-colors" onClick={() => aiAudioRef.current?.play() || speak(practiceText)} />
                                    <span className="font-mono text-lg font-medium tracking-wide">{evaluation.ipa}</span>
                                    <button onClick={toggleAiPlay} className="text-xs px-2 py-0.5 rounded border border-indigo-500/30 hover:bg-indigo-500/20 transition-colors ml-2">
                                        跟读
                                    </button>
                                </div>
                             )}
                         </div>
                      </div>

                      {/* Score Visualization Area */}
                      <div className="flex flex-col md:flex-row items-center gap-8 mb-6">
                        
                        {/* 1. Circular Score (Left) */}
                        <div className="flex flex-col items-center justify-center gap-2 shrink-0">
                            <div className="relative w-28 h-28">
                                {/* SVG Donut Chart */}
                                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                    {/* Track */}
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="42"
                                        fill="none"
                                        stroke="#1e293b" // slate-800
                                        strokeWidth="8"
                                        strokeLinecap="round"
                                    />
                                    {/* Progress */}
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="42"
                                        fill="none"
                                        stroke={evaluation.score >= 80 ? "#10b981" : (evaluation.score >= 60 ? "#f59e0b" : "#ef4444")} 
                                        strokeWidth="8"
                                        strokeLinecap="round"
                                        strokeDasharray={`${(evaluation.score / 100) * 263.89} 263.89`} // 2 * PI * 42 ~= 263.89
                                        className="transition-all duration-1000 ease-out"
                                    />
                                </svg>
                                {/* Center Score Text */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className={`text-3xl font-bold ${evaluation.score >= 80 ? 'text-emerald-400' : (evaluation.score >= 60 ? 'text-amber-400' : 'text-rose-400')}`}>
                                        {evaluation.score}
                                    </span>
                                </div>
                            </div>
                            <span className="text-xs text-slate-500 font-medium">我的发音</span>
                        </div>

                        {/* 2. Phoneme Breakdown Bars (Right) */}
                        {evaluation.breakdown && evaluation.breakdown.length > 0 && (
                            <div className="flex-1 w-full overflow-x-auto pb-2 custom-scrollbar">
                                <div className="flex items-end justify-between gap-3 h-28 px-2 min-w-[200px]">
                                    {evaluation.breakdown.map((item, i) => (
                                        <div key={i} className="flex flex-col items-center gap-2 flex-1 group min-w-[16px]">
                                            {/* Bar Container */}
                                            <div className="w-2.5 md:w-3 bg-slate-800 rounded-full h-full relative overflow-hidden w-full max-w-[12px]">
                                                {/* Filled Part */}
                                                <div 
                                                    className={`absolute bottom-0 left-0 w-full rounded-full transition-all duration-700 ease-out ${item.score >= 80 ? 'bg-emerald-500' : (item.score >= 60 ? 'bg-amber-500' : 'bg-rose-500')}`} 
                                                    style={{ height: `${item.score}%` }} 
                                                />
                                            </div>
                                            {/* Phoneme Label */}
                                            <span className="text-sm font-mono font-medium text-slate-500 group-hover:text-slate-300 transition-colors">
                                                {item.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                      </div>
                      
                      {/* Feedback Text */}
                      <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                          <p className="text-slate-400 text-xs leading-relaxed">{evaluation.feedback}</p>
                      </div>
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => userAudioRef.current?.play()}
                      className="py-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center gap-2 text-slate-300 font-bold hover:bg-slate-800 active:scale-95 transition-all"
                    >
                      <Play size={18} /> 回听录音
                    </button>
                    <audio ref={userAudioRef} src={userAudioUrl || ''} className="hidden" />
                    
                    <button
                      onClick={() => {
                        cancelLocalSpeech();
                        setEvaluation(null);
                        setState('practice');
                      }}
                      className="py-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center gap-2 text-slate-300 font-bold hover:bg-slate-800 active:scale-95 transition-all"
                    >
                      <RotateCcw size={18} /> 再练一次
                    </button>
                  </div>

                  <button
                    onClick={resetSession}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-indigo-900/20 active:scale-[0.98] transition-all"
                  >
                    <CheckCircle size={18} /> 完成练习
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
