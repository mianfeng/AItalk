
import React, { useState, useEffect, useRef } from 'react';
import { StudyItem, SessionResult } from '../types';
import { Check, X, Volume2, PlayCircle, AlertCircle, Loader2, Sparkles, Mic, Square, HelpCircle, Heart, ArrowRight, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { evaluatePronunciation } from '../services/contentGen';
import { useSpeech } from '../hooks/useSpeech';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

interface StudySessionProps {
  items: StudyItem[];
  initialIndex: number; 
  onProgress: (index: number) => void;
  onComplete: (results: SessionResult[]) => void;
  onBack: () => void;
}

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
  const [pronunciationResult, setPronunciationResult] = useState<{score: number, feedback: string} | null>(null);

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
          <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6">
              <AlertCircle size={48} className="mb-4 text-violet-400" />
              <p>{!items || items.length === 0 ? '暂无学习内容，请返回重新生成。' : '学习完成！'}</p>
              <button onClick={onBack} className="mt-6 px-6 py-2 bg-slate-800 rounded-full text-sm text-white border border-slate-700">返回首页</button>
          </div>
      );
  }

  const progress = (currentIndex / items.length) * 100;
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
        const base64 = await stopRecording();
        const result = await evaluatePronunciation(base64, currentItem.text);
        setPronunciationResult(result);
        setRecordingState('result');
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
               <div className="glass rounded-xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-lg font-bold text-white">学习模式说明</h3>
                       <button onClick={() => setShowHelp(false)}><X size={20} className="text-slate-400" /></button>
                   </div>
                   <div className="space-y-4">
                       <p className="text-slate-300 text-sm">
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
                             className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-violet-600"
                           />
                           <label htmlFor="autoplay" className="text-sm text-slate-400">自动播放单词发音</label>
                       </div>
                   </div>
               </div>
           </div>
       )}

       <div className="absolute top-3 left-4 z-10">
           <button onClick={onBack} className="p-2 text-slate-400 hover:text-white transition-colors"><ArrowLeft size={22} /></button>
       </div>
       <div className="absolute top-3 right-4 z-10 flex gap-2">
           <button onClick={() => setShowHelp(true)} className="p-2 text-slate-400 hover:text-white transition-colors"><HelpCircle size={20} /></button>
       </div>

       <div className="w-full h-1.5 bg-slate-800 rounded-full mb-6 mt-12 overflow-hidden shrink-0 border border-white/5">
          <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
       </div>

       {/* Card Container */}
       <div className={`perspective-1000 w-full flex-1 max-h-[55vh] min-h-[320px] relative group my-auto transition-all duration-300 ${isTransitioning ? 'opacity-0 translate-x-[-20px] scale-95' : 'opacity-100 translate-x-0 scale-100'}`}>
          <button onClick={toggleCollect} className="absolute top-4 right-4 z-20 p-2 rounded-full hover:bg-black/20 transition-colors">
              <Heart size={22} className={`transition-all ${isCollected ? 'text-rose-500 fill-rose-500 scale-110' : 'text-slate-400 hover:text-rose-400'}`} />
          </button>

          <div className={`w-full h-full transition-transform duration-500 transform-style-3d relative ${isFlipped ? 'rotate-y-180' : ''}`}>
             
             {/* Front Side: Context Learning Mode - Deep Violet Gradient */}
             <div className="absolute inset-0 backface-hidden bg-gradient-to-br from-indigo-950/90 to-slate-900/90 border border-indigo-500/30 rounded-3xl flex flex-col p-5 shadow-2xl backdrop-blur-xl">
                 <div className="flex items-center gap-2 mb-2 shrink-0">
                    {currentLevel === 0 && <span className="text-[10px] font-bold text-amber-300 bg-amber-900/40 px-2 py-0.5 rounded border border-amber-500/20 shadow-sm">New</span>}
                    <span className="text-[10px] font-semibold tracking-widest text-violet-300 uppercase bg-violet-900/40 px-2.5 py-0.5 rounded-full border border-violet-500/20">
                        {currentItem.type}
                    </span>
                 </div>
                 
                 <div className="flex-1 flex flex-col items-center justify-center">
                     <h2 className="text-3xl font-bold text-center text-white mb-3 select-none px-2 break-words max-w-full leading-tight drop-shadow-lg">{currentItem.text}</h2>
                     
                     <div className="flex items-center gap-4 mb-6">
                         <button onClick={(e) => { e.stopPropagation(); speak(currentItem.text, speechRate); }} className={`w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition-all shadow-lg border border-white/10 ${isPlaying ? 'bg-white/20 text-cyan-300 scale-110' : 'bg-white/5 text-slate-300 hover:scale-105'}`}>
                            {isPlaying ? <Loader2 size={20} className="animate-spin" /> : <Volume2 size={20} />}
                         </button>
                         {currentItem.pronunciation && (
                             <span className="text-slate-400 font-mono text-xs tracking-wider bg-black/20 px-3 py-1.5 rounded-lg border border-white/5">{currentItem.pronunciation}</span>
                         )}
                     </div>

                     {/* Context Area - Glassy */}
                     <div className="w-full bg-white/5 rounded-2xl p-4 border border-white/5 mb-2 shadow-inner">
                        <div className="text-xs text-indigo-300 uppercase tracking-widest mb-2 font-bold flex items-center gap-2">
                            <Sparkles size={12} className="text-amber-400" /> 语境例句
                        </div>
                        <p className="text-slate-200 text-sm leading-relaxed italic line-clamp-4 font-light">
                            "{currentItem.example}"
                        </p>
                     </div>

                     {/* English Hint Toggle */}
                     {hasEnglishHint && (
                         <div className="w-full mt-2">
                             <button 
                                onClick={(e) => { e.stopPropagation(); setShowEnglishHint(!showEnglishHint); }}
                                className="flex items-center gap-2 text-xs text-slate-500 hover:text-cyan-400 transition-colors mx-auto py-2"
                             >
                                 {showEnglishHint ? <EyeOff size={14} /> : <Eye size={14} />}
                                 {showEnglishHint ? "隐藏释义" : "查看英文释义"}
                             </button>
                             
                             <div className={`overflow-hidden transition-all duration-300 ${showEnglishHint ? 'max-h-20 opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                                 <p className="text-xs text-slate-400 text-center bg-black/20 p-2 rounded-lg border border-white/5">
                                     {currentItem.definition}
                                 </p>
                             </div>
                         </div>
                     )}
                 </div>
                 
                 <div className="text-center text-[10px] text-slate-600 mt-3 font-medium">
                     点击下方按钮验证
                 </div>
             </div>

             {/* Back Side: Detail & Verify Mode - Darker Slate */}
             <div className="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900/95 border border-slate-700 rounded-3xl flex flex-col p-0 shadow-2xl overflow-hidden relative backdrop-blur-xl">
                 {/* Back Header */}
                 <div className="bg-black/20 border-b border-white/5 p-4 flex items-start justify-between shrink-0">
                     <div className="flex-1 min-w-0 pr-2">
                        <h3 className="text-xl font-bold text-white truncate">{currentItem.text}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-slate-400 font-mono bg-white/5 px-2 py-0.5 rounded border border-white/5">Lv {currentLevel}</span>
                            <button onClick={(e) => { e.stopPropagation(); speak(currentItem.text, speechRate); }} className="text-slate-400 hover:text-white">
                                <Volume2 size={16} />
                            </button>
                        </div>
                     </div>
                     <div className={`px-3 py-1 rounded-full text-[10px] font-bold border shrink-0 ${currentRating ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                         {currentRating ? '已掌握' : '需复习'}
                     </div>
                 </div>

                 {/* Back Content */}
                 <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                     
                     {/* Definition Section */}
                     <div className="text-center py-4 bg-gradient-to-br from-violet-500/10 to-transparent rounded-2xl border border-violet-500/10">
                        <p className="text-lg text-violet-300 font-bold mb-1 leading-snug px-2">{currentItem.translation}</p>
                        {currentItem.definition && hasEnglishHint && <p className="text-[10px] text-slate-500 leading-relaxed px-4 mt-2 border-t border-white/5 pt-2 line-clamp-2">{currentItem.definition}</p>}
                     </div>

                     {/* Example Section */}
                     <div className="bg-white/5 p-4 rounded-2xl border-l-4 border-cyan-500 relative group/example">
                        <p className="text-xs text-slate-200 italic pr-6 mb-2 leading-relaxed">"{currentItem.example}"</p>
                        {currentItem.example_zh && <p className="text-[10px] text-slate-500 leading-snug">{currentItem.example_zh}</p>}
                        <button onClick={(e) => { e.stopPropagation(); speak(currentItem.example, speechRate); }} className="absolute right-2 top-2 p-1.5 text-slate-500 hover:text-white transition-colors">
                            <PlayCircle size={16} />
                        </button>
                     </div>

                     {/* Extra Info */}
                     {currentItem.extra_info && (
                         <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/10 p-3 rounded-xl text-[10px] text-amber-200/70">
                            <Sparkles size={12} className="shrink-0 mt-0.5 text-amber-500" />
                            <span>{currentItem.extra_info}</span>
                         </div>
                     )}

                     {/* Pronunciation Evaluation Area */}
                     <div className="bg-black/30 rounded-2xl p-3 border border-white/5 flex items-center justify-between gap-3">
                         <div className="flex-1 min-w-0">
                             <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">发音评测</div>
                             {pronunciationResult ? (
                                 <div>
                                     <div className="flex items-baseline gap-1">
                                         <span className={`text-base font-bold ${pronunciationResult.score > 80 ? 'text-emerald-400' : 'text-orange-400'}`}>{pronunciationResult.score}</span>
                                         <span className="text-[9px] text-slate-600">/100</span>
                                     </div>
                                     <p className="text-[9px] text-slate-400 line-clamp-1">{pronunciationResult.feedback}</p>
                                 </div>
                             ) : (
                                 <p className="text-[10px] text-slate-600">点击麦克风，大声朗读单词</p>
                             )}
                         </div>
                         <button onClick={toggleRecording} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 border border-white/10 ${recordingState === 'recording' ? 'bg-rose-500 text-white animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.4)]' : (recordingState === 'evaluating' ? 'bg-slate-800 text-slate-500' : 'bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white hover:border-cyan-500/50')}`}>
                            {recordingState === 'recording' ? <Square size={14} fill="currentColor" /> : (recordingState === 'evaluating' ? <Loader2 size={16} className="animate-spin" /> : <Mic size={18} />)}
                         </button>
                     </div>
                 </div>
             </div>
          </div>
       </div>

       <div className={`flex items-center gap-3 mt-6 w-full justify-center shrink-0 pb-4 transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
          {!isFlipped ? (
             <>
                <button onClick={() => handleRate(false)} className="flex-1 py-4 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-300 font-bold hover:bg-slate-700 hover:border-rose-500/50 hover:text-rose-400 transition-all flex justify-center items-center gap-2 active:scale-95 shadow-lg group text-sm backdrop-blur-md">
                   <X size={18} className="text-slate-500 group-hover:text-rose-400" /> 需复习
                </button>
                <button onClick={() => handleRate(true)} className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-105 shadow-lg transition-all flex justify-center items-center gap-2 active:scale-95 text-sm border border-emerald-500/50">
                   <Check size={18} /> 掌握了
                </button>
             </>
          ) : (
             <button onClick={handleNext} className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold hover:shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all flex justify-center items-center gap-2 animate-in fade-in slide-in-from-bottom-2 shadow-lg active:scale-95 text-sm border border-indigo-500/50">
                下一个 <ArrowRight size={18} />
             </button>
          )}
       </div>
    </div>
  );
};
