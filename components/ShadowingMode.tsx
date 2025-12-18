import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Play, Pause, Mic, Square, Volume2, RefreshCcw, Sparkles, Loader2, CheckCircle, RotateCcw, Info, ArrowRight, Gauge } from 'lucide-react';
import { generateSpeech, evaluatePronunciation } from '../services/contentGen';
import { pcmToWav } from '../services/audioUtils';

interface ShadowingModeProps {
  onBack: () => void;
}

export const ShadowingMode: React.FC<ShadowingModeProps> = ({ onBack }) => {
  const [inputText, setInputText] = useState('');
  const [practiceText, setPracticeText] = useState('');
  const [state, setState] = useState<'input' | 'practice' | 'processing' | 'result'>('input');
  
  // AI Audio State
  const [aiAudioUrl, setAiAudioUrl] = useState<string | null>(null);
  const [aiIsLoading, setAiIsLoading] = useState(false);
  const [aiIsPlaying, setAiIsPlaying] = useState(false);
  const [aiCurrentTime, setAiCurrentTime] = useState(0);
  const [aiDuration, setAiDuration] = useState(0);
  const [aiSpeed, setAiSpeed] = useState(1.0);
  
  // User Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [evaluation, setEvaluation] = useState<{ score: number, feedback: string } | null>(null);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
  
  const aiAudioRef = useRef<HTMLAudioElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const userAudioRef = useRef<HTMLAudioElement>(null);
  
  const handleStartPractice = () => {
    if (!inputText.trim()) return;
    setPracticeText(inputText);
    setState('practice');
    setAiAudioUrl(null); // Reset audio for new text
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
      } else {
        alert("语音生成失败，请重试");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAiIsLoading(false);
    }
  };

  const toggleAiPlay = async () => {
    if (!aiAudioUrl) {
      await loadAiAudio();
      // Auto-play after loading is handled by effect or manual call
      return;
    }

    if (aiIsPlaying) {
      aiAudioRef.current?.pause();
    } else {
      aiAudioRef.current?.play();
    }
  };

  // Sync AI audio speed
  useEffect(() => {
    if (aiAudioRef.current) {
      aiAudioRef.current.playbackRate = aiSpeed;
    }
  }, [aiSpeed]);

  const handleAiTimeUpdate = () => {
    if (aiAudioRef.current) {
      setAiCurrentTime(aiAudioRef.current.currentTime);
      setAiDuration(aiAudioRef.current.duration || 0);
    }
  };

  const handleAiSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (aiAudioRef.current) {
      aiAudioRef.current.currentTime = time;
      setAiCurrentTime(time);
    }
  };

  const toggleAiSpeed = () => {
    const speeds = [1.0, 0.75, 0.5];
    const currentIndex = speeds.indexOf(aiSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    setAiSpeed(speeds[nextIndex]);
  };

  const toggleRecording = async () => {
    // If user is listening to AI, stop it first
    if (aiIsPlaying) aiAudioRef.current?.pause();

    if (isRecording) {
      mediaRecorderRef.current?.stop();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        };

        recorder.start();
        setIsRecording(true);
      } catch (e) {
        alert("无法访问麦克风");
      }
    }
  };

  useEffect(() => {
    return () => {
      if (aiAudioUrl) URL.revokeObjectURL(aiAudioUrl);
      if (userAudioUrl) URL.revokeObjectURL(userAudioUrl);
    };
  }, [aiAudioUrl, userAudioUrl]);

  // Format time (0:00)
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200 overflow-y-auto">
      {/* Header */}
      <div className="h-16 shrink-0 border-b border-slate-900 bg-slate-950 flex items-center px-4 sticky top-0 z-10">
        <button 
          onClick={state === 'input' ? onBack : () => setState('input')}
          className="mr-4 p-2 -ml-2 rounded-full hover:bg-slate-900 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-bold">跟读练习 (Shadowing)</h2>
      </div>

      <div className="flex-1 p-4 md:p-6 max-w-2xl mx-auto w-full flex flex-col gap-6 pb-20">
        
        {/* VIEW: INPUT TEXT */}
        {state === 'input' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-indigo-900/10 border border-indigo-500/20 p-4 rounded-xl flex items-start gap-3">
              <Info className="text-indigo-400 shrink-0 mt-1" size={18} />
              <p className="text-sm text-indigo-200/70 leading-relaxed">
                在这里输入你想练习的句子或段落。我们将为你生成纯正的语音示范，通过反复聆听和模仿来纠正发音。
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">练习内容</label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="例如: I'm gonna make him an offer he can't refuse."
                className="w-full h-48 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-slate-100 placeholder:text-slate-600 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500/50 outline-none transition-all resize-none"
              />
            </div>

            <button
              onClick={handleStartPractice}
              disabled={!inputText.trim()}
              className="w-full py-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 text-white font-bold rounded-2xl shadow-xl shadow-purple-900/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              开始练习 <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* VIEW: PRACTICE & RESULT */}
        {(state === 'practice' || state === 'processing' || state === 'result') && (
          <div className="space-y-8 animate-in fade-in zoom-in-95">
            
            {/* The Text to Practice Card */}
            <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-3xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
              
              <div className="flex items-center gap-2 mb-6">
                <span className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-tighter">示范文本</span>
              </div>

              <p className="text-xl md:text-2xl font-medium text-slate-100 text-center leading-relaxed mb-10">
                {practiceText}
              </p>
              
              {/* AI PLAYER UI */}
              <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800 p-4 rounded-2xl">
                 <div className="flex flex-col gap-3">
                    
                    {/* Progress Bar */}
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-slate-500 w-8">{formatTime(aiCurrentTime)}</span>
                        <input 
                            type="range" 
                            min="0" 
                            max={aiDuration || 100} 
                            step="0.01"
                            value={aiCurrentTime}
                            onChange={handleAiSeek}
                            className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <span className="text-[10px] font-mono text-slate-500 w-8">{formatTime(aiDuration)}</span>
                    </div>

                    <div className="flex items-center justify-between px-2">
                        {/* Speed Toggle */}
                        <button 
                            onClick={toggleAiSpeed}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-400 transition-colors border border-slate-800"
                        >
                            <Gauge size={14} />
                            <span>{aiSpeed}x</span>
                        </button>

                        {/* Main Play/Pause Button */}
                        <button
                            onClick={toggleAiPlay}
                            disabled={aiIsLoading}
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${
                                aiIsLoading ? 'bg-slate-800 text-slate-600' : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-105 active:scale-95'
                            }`}
                        >
                            {aiIsLoading ? <Loader2 size={24} className="animate-spin" /> : 
                             (aiIsPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />)}
                        </button>

                        {/* Filler for layout balance */}
                        <div className="w-[60px]"></div>
                    </div>
                 </div>
              </div>

              {/* Hidden Audio Element for AI */}
              {aiAudioUrl && (
                  <audio 
                    ref={aiAudioRef} 
                    src={aiAudioUrl} 
                    onPlay={() => setAiIsPlaying(true)}
                    onPause={() => setAiIsPlaying(false)}
                    onEnded={() => setAiIsPlaying(false)}
                    onTimeUpdate={handleAiTimeUpdate}
                    onLoadedMetadata={handleAiTimeUpdate}
                  />
              )}
            </div>

            {/* Actions / Results */}
            <div className="flex flex-col items-center gap-8">
              
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
                  <p className="text-slate-400 text-sm font-medium animate-pulse">
                    {isRecording ? '录音中，读完点击停止' : '点击麦克风开始跟读'}
                  </p>
                </div>
              )}

              {state === 'processing' && (
                <div className="flex flex-col items-center gap-4 py-8">
                   <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                     <RefreshCcw className="animate-spin text-purple-500" size={32} />
                   </div>
                   <p className="text-slate-500 font-medium">AI 正在评估你的发音...</p>
                </div>
              )}

              {state === 'result' && evaluation && (
                <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  
                  {/* Score Card */}
                  <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 flex flex-col items-center shadow-2xl">
                     <div className="text-xs text-indigo-400 font-bold uppercase tracking-widest mb-2">本次跟读得分</div>
                     <div className="text-6xl font-black text-white mb-4 flex items-baseline gap-1">
                        {evaluation.score}
                        <span className="text-xl text-slate-500 font-medium">/ 100</span>
                     </div>
                     <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-6">
                        <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${evaluation.score}%` }}></div>
                     </div>

                     {/* Feedback */}
                     <div className="w-full bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                        <div className="flex items-center gap-2 mb-2 text-amber-400 text-xs font-bold uppercase">
                          <Sparkles size={14} /> 提升建议
                        </div>
                        <p className="text-slate-300 text-sm leading-relaxed italic">
                          "{evaluation.feedback}"
                        </p>
                     </div>
                  </div>

                  {/* Playback & Retry */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => userAudioRef.current?.play()}
                      className="py-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center gap-2 text-slate-300 font-bold hover:bg-slate-800 transition-colors"
                    >
                      <Play size={18} /> 回听我的录音
                    </button>
                    <audio ref={userAudioRef} src={userAudioUrl || ''} className="hidden" />
                    
                    <button
                      onClick={() => {
                        setEvaluation(null);
                        setState('practice');
                        setIsRecording(false);
                      }}
                      className="py-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center gap-2 text-slate-300 font-bold hover:bg-slate-800 transition-colors"
                    >
                      <RotateCcw size={18} /> 再练一次
                    </button>
                  </div>

                  <button
                    onClick={() => setState('input')}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-900/20"
                  >
                    <CheckCircle size={18} /> 完成并练习新内容
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