
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { StudyItem, SessionResult } from '../types';
import { Check, X, Volume2, PlayCircle, AlertCircle, Loader2, Sparkles, Mic, Square, HelpCircle, Heart, ArrowRight, ArrowLeft, Eye, EyeOff, BarChart2, RotateCcw } from 'lucide-react';
import { evaluatePronunciation, PronunciationResult } from '../services/contentGen';
import { useSpeech } from '../hooks/useSpeech';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

interface StudySessionProps {
  items: StudyItem[];
  initialIndex: number; 
  onProgress: (index: number) => void;
  onComplete: (results: SessionResult[]) => void;
  onBack: () => void;
}

// 环绕进度边框组件
const CardProgressBorder: React.FC<{ progress: number; children: React.ReactNode }> = ({ progress, children }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useLayoutEffect(() => {
        if (!containerRef.current) return;
        const updateDimensions = () => {
            if (containerRef.current) {
                const { offsetWidth, offsetHeight } = containerRef.current;
                setDimensions({ width: offsetWidth, height: offsetHeight });
            }
        };
        updateDimensions();
        const observer = new ResizeObserver(() => updateDimensions());
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const strokeWidth = 4;
    const radius = 24; 
    const w = dimensions.width;
    const h = dimensions.height;
    const perimeter = 2 * (w - 2 * radius) + 2 * (h - 2 * radius) + (2 * Math.PI * radius);
    const totalLength = perimeter > 0 ? perimeter : 0;
    const dashOffset = totalLength - (progress * totalLength);

    return (
        <div className="relative w-full h-full flex flex-col" ref={containerRef}>
            <div className="relative z-10 h-full w-full">{children}</div>
            <svg className="absolute inset-0 pointer-events-none w-full h-full z-20 overflow-visible" width={w} height={h}>
                <defs>
                    <linearGradient id="studyProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#22d3ee" />
                    </linearGradient>
                    <filter id="studyGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>
                <rect x={0} y={0} width={w} height={h} rx={radius} ry={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
                {totalLength > 0 && (
                    <rect x={0} y={0} width={w} height={h} rx={radius} ry={radius} fill="none" stroke="url(#studyProgressGradient)" strokeWidth={strokeWidth} strokeDasharray={totalLength} strokeDashoffset={dashOffset} strokeLinecap="round" className="transition-all duration-700 ease-out" filter="url(#studyGlow)" />
                )}
            </svg>
        </div>
    );
};

export const StudySession: React.FC<StudySessionProps> = ({ items, initialIndex, onProgress, onComplete, onBack }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showEnglishHint, setShowEnglishHint] = useState(false); 
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [autoPlay, setAutoPlay] = useState(true);
  
  const { speak, isPlaying, cancel: cancelSpeech } = useSpeech();
  const { isRecording, startRecording, stopRecording } = useAudioRecorder();

  const [currentRating, setCurrentRating] = useState<boolean | null>(null);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [collectedIds, setCollectedIds] = useState<Set<string>>(new Set());
  
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'evaluating' | 'result'>('idle');
  const [pronunciationResult, setPronunciationResult] = useState<PronunciationResult | null>(null);

  const hasPlayedRef = useRef<number | null>(null);

  useEffect(() => {
      const initialSaved = new Set<string>();
      if (items) {
          items.forEach(item => {
              if (item.saved) initialSaved.add(item.id);
          });
      }
      setCollectedIds(initialSaved);
  }, [items]);

  useEffect(() => {
    if (items && items[currentIndex]) {
        onProgress(currentIndex);
        if (autoPlay && !isFlipped && hasPlayedRef.current !== currentIndex) {
            hasPlayedRef.current = currentIndex;
            setTimeout(() => {
                speak(items[currentIndex].text, speechRate);
            }, 400);
        }
    }
  }, [currentIndex, onProgress, items, autoPlay, isFlipped, speechRate, speak]);

  const resetCardState = () => {
      setIsFlipped(false);
      setCurrentRating(null);
      setRecordingState('idle');
      setPronunciationResult(null);
      setShowEnglishHint(false); 
      cancelSpeech();
  };

  const currentItem = items && items[currentIndex];

  if (!items || items.length === 0 || !currentItem) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 p-6">
              <AlertCircle size={48} className="mb-4 text-slate-600" />
              <p>{!items || items.length === 0 ? '暂无学习内容，请返回重新生成。' : '学习完成！'}</p>
              <button onClick={onBack} className="mt-6 px-6 py-2 bg-slate-800 rounded-full text-sm text-slate-300 border border-slate-700 hover:bg-slate-700 transition-colors">返回首页</button>
          </div>
      );
  }

  const progressValue = (currentIndex + 1) / items.length;
  
  const isCollected = collectedIds.has(currentItem.id);
  const currentLevel = typeof currentItem.masteryLevel === 'number' ? currentItem.masteryLevel : 0;
  const hasEnglishHint = currentItem.definition && currentItem.definition.length > 5 && !currentItem.definition.includes(currentItem.translation);

  const toggleCollect = (e: React.MouseEvent) => {
      e.stopPropagation();
      const newSet = new Set(collectedIds);
      if (newSet.has(currentItem.id)) newSet.delete(currentItem.id);
      else newSet.add(currentItem.id);
      setCollectedIds(newSet);
  };

  const handleRate = (mastered: boolean) => {
      setCurrentRating(mastered);
      setIsFlipped(true);
  };

  const handleNext = () => {
    if (currentRating === null) return;
    const currentResult: SessionResult = {
        item: { ...currentItem, saved: isCollected }, 
        remembered: currentRating
    };
    const updatedResults = [...results, currentResult];
    setResults(updatedResults);
    
    if (currentIndex < items.length - 1) {
      setIsTransitioning(true);
      setTimeout(() => {
          resetCardState();
          setCurrentIndex(prev => prev + 1);
          setTimeout(() => setIsTransitioning(false), 50);
      }, 300);
    } else {
      onComplete(updatedResults);
    }
  };

  const toggleRecording = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRecording) {
        setRecordingState('evaluating');
        try {
            const base64 = await stopRecording();
            const result = await evaluatePronunciation(base64, currentItem.text);
            setPronunciationResult(result);
            setRecordingState('result');
        } catch (e) {
            setRecordingState('idle');
            alert("录音失败，请重试");
        }
    } else {
        setPronunciationResult(null);
        setRecordingState('recording');
        startRecording();
    }
  };

  return (
    <div className="flex flex-col items-center h-full w-full max-w-md mx-auto p-4 relative">
       {showHelp && (
           <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setShowHelp(false)}>
               <div className="glass-card rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-700" onClick={e => e.stopPropagation()}>
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-lg font-bold text-slate-100">学习模式说明</h3>
                       <button onClick={() => setShowHelp(false)}><X size={20} className="text-slate-400 hover:text-white" /></button>
                   </div>
                   <div className="space-y-4">
                       <p className="text-slate-400 text-sm leading-relaxed">
                           1. <b>阅读语境</b>：先读单词和例句，尝试推断意思。<br/>
                           2. <b>自我评估</b>：如果能推断出意思，选“掌握了”，否则选“需复习”。<br/>
                           3. <b>查看详情</b>：卡片翻转后，查看中文翻译并进行发音练习。
                       </p>
                       <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
                           <input 
                             type="checkbox" 
                             id="autoplay" 
                             checked={autoPlay} 
                             onChange={(e) => setAutoPlay(e.target.checked)}
                             className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-indigo-500"
                           />
                           <label htmlFor="autoplay" className="text-sm text-slate-400">自动播放单词发音</label>
                       </div>
                   </div>
               </div>
           </div>
       )}

       {/* Header */}
       <div className="w-full flex items-center justify-between mb-4 px-1 shrink-0">
           <button onClick={onBack} className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-white/10">
               <ArrowLeft size={22} />
           </button>
           
           <div className="flex items-center gap-4">
               <div className="flex flex-col items-end">
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-0.5">Study Plan</span>
                    <span className="text-sm font-mono font-medium text-slate-300">
                    <span className="text-indigo-400 text-lg">{currentIndex + 1}</span>
                    <span className="text-slate-600 mx-1">/</span>
                    {items.length}
                    </span>
               </div>
               <button onClick={() => setShowHelp(true)} className="p-2 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-white/10">
                   <HelpCircle size={20} />
               </button>
           </div>
       </div>

       {/* Card Container - Adjusted height for mobile */}
       <div className={`w-full flex-1 max-h-[75vh] min-h-[420px] relative group my-auto transition-all duration-300 ${isTransitioning ? 'opacity-0 translate-x-[-20px] scale-95' : 'opacity-100 translate-x-0 scale-100'}`}>
          <CardProgressBorder progress={progressValue}>
              <div className="perspective-1000 w-full h-full relative">
                  <div className={`w-full h-full transition-transform duration-500 transform-style-3d relative ${isFlipped ? 'rotate-y-180' : ''}`}>
                     
                     {/* Front Side */}
                     <div className="absolute inset-0 backface-hidden bg-gradient-to-br from-indigo-900/90 via-slate-900 to-slate-950 rounded-3xl flex flex-col p-6 shadow-2xl backdrop-blur-xl overflow-hidden">
                         <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="flex flex-col items-start gap-1.5">
                                {currentLevel === 0 && <span className="text-[10px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/20 shadow-sm animate-pulse">New</span>}
                                <span className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase bg-white/5 px-2.5 py-0.5 rounded-full border border-white/5">
                                    {currentItem.type}
                                </span>
                            </div>
                            <button onClick={toggleCollect} className={`p-2 rounded-full hover:bg-white/10 transition-all ${isCollected ? 'text-rose-500 fill-rose-500' : 'text-slate-500 hover:text-rose-400'}`}>
                                <Heart size={22} />
                            </button>
                         </div>
                         
                         <div className="flex-1 flex flex-col items-center justify-center -mt-6 relative z-10">
                             <h2 className="text-4xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-300 mb-4 select-none px-2 break-words max-w-full leading-tight drop-shadow-sm tracking-tight">{currentItem.text}</h2>
                             
                             <div className="flex items-center gap-4 mb-8">
                                 <button onClick={(e) => { e.stopPropagation(); speak(currentItem.text, speechRate); }} className={`w-12 h-12 flex items-center justify-center rounded-full transition-all shadow-lg border border-white/10 ${isPlaying ? 'bg-indigo-500 text-white scale-110 shadow-indigo-500/30' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-indigo-300 hover:scale-105'}`}>
                                    {isPlaying ? <Loader2 size={20} className="animate-spin" /> : <Volume2 size={20} />}
                                 </button>
                                 {currentItem.pronunciation && (
                                     <span className="text-slate-400 font-mono text-sm tracking-wide bg-black/20 px-3 py-1.5 rounded-lg border border-white/5">{currentItem.pronunciation}</span>
                                 )}
                             </div>

                             <div className="w-full bg-black/20 rounded-2xl p-5 border border-white/5 mb-2 shadow-inner">
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-bold flex items-center gap-2">
                                    <Sparkles size={10} className="text-amber-400" /> 语境例句
                                </div>
                                <p className="text-slate-200 text-sm leading-relaxed italic line-clamp-4 font-light opacity-90">
                                    "{currentItem.example}"
                                </p>
                             </div>

                             {hasEnglishHint && (
                                 <div className="w-full mt-3">
                                     <button 
                                        onClick={(e) => { e.stopPropagation(); setShowEnglishHint(!showEnglishHint); }}
                                        className="flex items-center gap-2 text-xs text-slate-500 hover:text-indigo-300 transition-colors mx-auto py-2 group"
                                     >
                                         {showEnglishHint ? <EyeOff size={14} className="group-hover:scale-110 transition-transform" /> : <Eye size={14} className="group-hover:scale-110 transition-transform" />}
                                         {showEnglishHint ? "隐藏释义" : "查看英文释义"}
                                     </button>
                                     
                                     <div className={`overflow-hidden transition-all duration-300 ${showEnglishHint ? 'max-h-20 opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                                         <p className="text-xs text-slate-400 text-center bg-white/5 p-3 rounded-xl border border-white/5">
                                             {currentItem.definition}
                                         </p>
                                     </div>
                                 </div>
                             )}
                         </div>
                         
                         <div className="text-center text-[10px] text-slate-600 mt-2 font-medium">
                             点击卡片翻转查看详情
                         </div>
                     </div>

                     {/* Back Side - Refined Layout for Visual Pronunciation */}
                     <div className="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 rounded-3xl flex flex-col p-0 shadow-2xl overflow-hidden relative">
                         {/* Back Header - Optimized: Translation next to Word */}
                         <div className="bg-black/20 border-b border-white/5 px-4 md:px-5 py-3 md:py-4 flex items-center justify-between shrink-0 min-h-[70px] backdrop-blur-md">
                             <div className="flex flex-col gap-1 overflow-hidden mr-2 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                                    <h3 className="text-xl md:text-2xl font-bold text-slate-200 leading-tight">{currentItem.text}</h3>
                                    <span className="text-sm md:text-base font-medium text-emerald-400 truncate leading-tight">{currentItem.translation}</span>
                                </div>
                                <div className="flex items-center gap-2 md:gap-3">
                                    <span className="text-xs md:text-sm font-mono text-slate-400/80 tracking-wide">{currentItem.pronunciation}</span>
                                    <button onClick={(e) => { e.stopPropagation(); speak(currentItem.text, speechRate); }} className="text-slate-500 hover:text-indigo-400 shrink-0 transition-colors pb-0.5">
                                        <Volume2 size={16} />
                                    </button>
                                    <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 bg-white/5 ml-auto md:ml-0">
                                        <BarChart2 size={10} className="text-indigo-400" />
                                        <span className="text-[10px] text-slate-400 font-mono">Lv {currentLevel}</span>
                                    </div>
                                </div>
                             </div>

                             <div className="flex items-center gap-2 md:gap-3 shrink-0 self-start mt-1">
                                 <button 
                                     onClick={toggleRecording} 
                                     className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all border shadow-sm ${recordingState === 'recording' ? 'bg-rose-500 border-rose-400 text-white animate-pulse' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-indigo-600 hover:border-indigo-500 hover:text-white'}`}
                                 >
                                    {recordingState === 'recording' ? <Square size={12} fill="currentColor" /> : (recordingState === 'evaluating' ? <Loader2 size={16} className="animate-spin" /> : <Mic size={18} />)}
                                 </button>
                                 <button onClick={toggleCollect} className={`w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full border border-transparent hover:bg-white/5 transition-colors ${isCollected ? 'text-rose-500 fill-rose-500' : 'text-slate-600 hover:text-rose-400'}`}>
                                     <Heart size={20} />
                                 </button>
                             </div>
                         </div>

                         {/* Back Content */}
                         <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-5 flex flex-col">
                             
                             {/* Pronunciation Visualization Area (Show if Result Exists) */}
                             {pronunciationResult && (
                                 <div className="mb-4 bg-slate-800/40 rounded-2xl p-3 md:p-4 border border-indigo-500/20 animate-in slide-in-from-top-2">
                                     <div className="flex items-center gap-4 mb-3">
                                         
                                         {/* Circular Score */}
                                         <div className="relative w-14 h-14 md:w-16 md:h-16 shrink-0">
                                             <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                                 <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />
                                                 <circle cx="50" cy="50" r="42" fill="none" stroke={pronunciationResult.score >= 80 ? "#10b981" : (pronunciationResult.score >= 60 ? "#f59e0b" : "#ef4444")} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(pronunciationResult.score / 100) * 263.89} 263.89`} className="transition-all duration-1000 ease-out" />
                                             </svg>
                                             <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                 <span className={`text-lg font-bold ${pronunciationResult.score >= 80 ? 'text-emerald-400' : (pronunciationResult.score >= 60 ? 'text-amber-400' : 'text-rose-400')}`}>{pronunciationResult.score}</span>
                                             </div>
                                         </div>

                                         {/* Phoneme Bars */}
                                         {pronunciationResult.breakdown && pronunciationResult.breakdown.length > 0 && (
                                            <div className="flex-1 w-full overflow-x-auto custom-scrollbar pb-1">
                                                <div className="flex items-end justify-center gap-1.5 md:gap-2 h-14 md:h-16 px-1 min-w-fit mx-auto">
                                                    {pronunciationResult.breakdown.map((item, i) => (
                                                        <div key={i} className="flex flex-col items-center gap-1 group min-w-[12px] md:min-w-[14px]">
                                                            {/* Bar Container - Fixed height to ensure visibility */}
                                                            <div className="w-2 md:w-2.5 bg-slate-700/50 rounded-full h-10 md:h-12 relative overflow-hidden flex flex-col justify-end">
                                                                <div 
                                                                    className={`w-full rounded-full transition-all duration-700 ease-out ${item.score >= 80 ? 'bg-emerald-500' : (item.score >= 60 ? 'bg-amber-500' : 'bg-rose-500')}`} 
                                                                    style={{ height: `${item.score}%` }} 
                                                                />
                                                            </div>
                                                            <span className="text-[10px] text-slate-500 font-mono font-medium uppercase">{item.label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                         )}
                                     </div>
                                     <p className="text-xs text-slate-400 leading-relaxed bg-black/20 p-2.5 rounded-xl border border-white/5">{pronunciationResult.feedback}</p>
                                 </div>
                             )}

                             {/* Definition Section (Optimized: Removed large translation block, keeping only distinct definition/extra info) */}
                             {(currentItem.definition || currentItem.extra_info) && (
                                 <div className="bg-white/5 rounded-xl p-3 border border-white/5 mb-3 shrink-0">
                                     {currentItem.definition && <p className="text-sm text-slate-300 leading-relaxed mb-1">{currentItem.definition}</p>}
                                     {currentItem.extra_info && <p className="text-xs text-amber-500/80">{currentItem.extra_info}</p>}
                                 </div>
                             )}

                             {/* Example Section */}
                             <div className="bg-slate-800/50 p-3 md:p-4 rounded-2xl border-l-4 border-indigo-500/50 relative group/example shadow-sm mb-4 flex-1">
                                <div className="absolute right-2 top-2 p-1.5 text-slate-600">
                                     <PlayCircle size={16} />
                                </div>
                                <p className="text-sm text-slate-300 italic pr-6 mb-2 leading-relaxed">"{currentItem.example}"</p>
                                {currentItem.example_zh && <p className="text-xs text-slate-500 leading-snug">{currentItem.example_zh}</p>}
                                <button onClick={(e) => { e.stopPropagation(); speak(currentItem.example, speechRate); }} className="absolute inset-0 w-full h-full cursor-pointer z-10" aria-label="Play example"></button>
                             </div>
                         </div>
                     </div>
                  </div>
              </div>
          </CardProgressBorder>
       </div>

       {/* Action Buttons */}
       <div className={`flex items-center gap-3 md:gap-4 mt-4 md:mt-6 w-full justify-center shrink-0 pb-4 md:pb-6 transition-all duration-300 ${isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
          {!isFlipped ? (
             <>
                <button onClick={() => handleRate(false)} className="flex-1 py-3 md:py-4 rounded-2xl bg-slate-800 border border-slate-700 text-slate-400 font-bold hover:bg-slate-700 hover:text-rose-400 hover:border-rose-500/30 transition-all flex justify-center items-center gap-2 active:scale-95 shadow-lg group text-sm">
                   <X size={18} className="text-slate-500 group-hover:text-rose-400 transition-colors" /> 需复习
                </button>
                <button onClick={() => handleRate(true)} className="flex-1 py-3 md:py-4 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 hover:shadow-indigo-500/30 shadow-lg transition-all flex justify-center items-center gap-2 active:scale-95 text-sm border-t border-white/10">
                   <Check size={18} /> 掌握了
                </button>
             </>
          ) : (
             <button onClick={handleNext} className="w-full py-3 md:py-4 rounded-2xl bg-cyan-600 text-white font-bold hover:bg-cyan-500 hover:shadow-cyan-500/30 transition-all flex justify-center items-center gap-2 animate-in fade-in slide-in-from-bottom-2 shadow-lg active:scale-95 text-sm border-t border-white/10">
                下一个 <ArrowRight size={18} />
             </button>
          )}
       </div>
    </div>
  );
};
