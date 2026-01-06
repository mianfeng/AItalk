
import React, { useState, useEffect, useRef } from 'react';
import { StudyItem, SessionResult } from '../types';
import { Check, X, Volume2, PlayCircle, AlertCircle, Loader2, Sparkles, Mic, Square, HelpCircle, Heart, ArrowRight, BarChart, ArrowLeft, BrainCircuit, Eye, EyeOff } from 'lucide-react';
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
  const [showEnglishHint, setShowEnglishHint] = useState(false); // New: Toggle for English definition on front
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);
  const [autoPlay, setAutoPlay] = useState(true);
  
  // Custom Hooks
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
        // Auto-play logic
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
      setShowEnglishHint(false); // Reset hint visibility
      cancelSpeech();
  };

  const currentItem = items && items[currentIndex];

  if (!items || items.length === 0 || !currentItem) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6">
              <AlertCircle size={48} className="mb-4 text-slate-600" />
              <p>{!items || items.length === 0 ? '暂无学习内容，请返回重新生成。' : '学习完成！'}</p>
              <button onClick={onBack} className="mt-6 px-6 py-2 bg-slate-800 rounded-full text-sm text-white">返回首页</button>
          </div>
      );
  }

  const progress = (currentIndex / items.length) * 100;
  const isCollected = collectedIds.has(currentItem.id);
  const currentLevel = typeof currentItem.masteryLevel === 'number' ? currentItem.masteryLevel : 0;
  // Determine if we have a valid English definition to show as a hint (Academic data often has empty definition field)
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
               <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
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
                       <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-800">
                           <input 
                             type="checkbox" 
                             id="autoplay" 
                             checked={autoPlay} 
                             onChange={(e) => setAutoPlay(e.target.checked)}
                             className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600"
                           />
                           <label htmlFor="autoplay" className="text-sm text-slate-400">自动播放单词发音</label>
                       </div>
                   </div>
               </div>
           </div>
       )}

       <div className="absolute top-3 left-4 z-10">
           <button onClick={onBack} className="p-2 text-slate-500 hover:text-white transition-colors"><ArrowLeft size={22} /></button>
       </div>
       <div className="absolute top-3 right-4 z-10 flex gap-2">
           <button onClick={() => setShowHelp(true)} className="p-2 text-slate-500 hover:text-white transition-colors"><HelpCircle size={20} /></button>
       </div>

       <div className="w-full h-1 bg-slate-800 rounded-full mb-4 mt-12 overflow-hidden shrink-0">
          <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
       </div>

       <div className={`perspective-1000 w-full flex-1 max-h-[60vh] min-h-[400px] relative group my-auto transition-all duration-300 ${isTransitioning ? 'opacity-0 translate-x-[-20px] scale-95' : 'opacity-100 translate-x-0 scale-100'}`}>
          <button onClick={toggleCollect} className="absolute top-3 right-3 z-20 p-2.5 rounded-full hover:bg-slate-900/50 transition-colors">
              <Heart size={22} className={`transition-all ${isCollected ? 'text-red-500 fill-red-500 scale-110' : 'text-slate-500 hover:text-red-400'}`} />
          </button>

          <div className={`w-full h-full transition-transform duration-500 transform-style-3d relative ${isFlipped ? 'rotate-y-180' : ''}`}>
             
             {/* Front Side: Context Learning Mode */}
             <div className="absolute inset-0 backface-hidden bg-slate-800 border-2 border-slate-700 rounded-2xl flex flex-col p-6 shadow-xl">
                 <div className="flex items-center gap-2 mb-4 shrink-0">
                    {currentLevel === 0 && <span className="text-[10px] font-bold text-amber-300 bg-amber-900/40 px-2 py-0.5 rounded border border-amber-700/50 shadow-sm">New</span>}
                    <span className="text-[10px] font-semibold tracking-widest text-emerald-400 uppercase bg-emerald-900/30 px-2.5 py-0.5 rounded-full">
                        {currentItem.type}
                    </span>
                 </div>
                 
                 <div className="flex-1 flex flex-col items-center justify-center">
                     <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-100 mb-6 select-none px-2 break-words max-w-full leading-tight">{currentItem.text}</h2>
                     
                     <div className="flex items-center gap-4 mb-8">
                         <button onClick={(e) => { e.stopPropagation(); speak(currentItem.text, speechRate); }} className={`w-12 h-12 flex items-center justify-center rounded-full hover:bg-slate-600 transition-all shadow-lg ${isPlaying ? 'bg-slate-600 text-blue-400 scale-110' : 'bg-slate-700 text-slate-200 hover:scale-105'}`}>
                            {isPlaying ? <Loader2 size={20} className="animate-spin" /> : <Volume2 size={20} />}
                         </button>
                         {currentItem.pronunciation && (
                             <span className="text-slate-400 font-mono text-sm tracking-wider bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700/50">{currentItem.pronunciation}</span>
                         )}
                     </div>

                     {/* Context Area */}
                     <div className="w-full bg-slate-900/50 rounded-xl p-4 border border-slate-700/50 mb-2">
                        <div className="text-xs text-slate-500 uppercase tracking-widest mb-2 font-bold flex items-center gap-2">
                            <Sparkles size={12} className="text-blue-400" /> 语境例句
                        </div>
                        <p className="text-slate-200 text-sm leading-relaxed italic">
                            "{currentItem.example}"
                        </p>
                     </div>

                     {/* English Hint Toggle */}
                     {hasEnglishHint && (
                         <div className="w-full mt-2">
                             <button 
                                onClick={(e) => { e.stopPropagation(); setShowEnglishHint(!showEnglishHint); }}
                                className="flex items-center gap-2 text-xs text-slate-500 hover:text-blue-400 transition-colors mx-auto py-2"
                             >
                                 {showEnglishHint ? <EyeOff size={14} /> : <Eye size={14} />}
                                 {showEnglishHint ? "隐藏英文释义" : "查看英文释义 (提示)"}
                             </button>
                             
                             <div className={`overflow-hidden transition-all duration-300 ${showEnglishHint ? 'max-h-20 opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                                 <p className="text-xs text-slate-400 text-center bg-slate-900/30 p-2 rounded-lg border border-slate-800">
                                     {currentItem.definition}
                                 </p>
                             </div>
                         </div>
                     )}
                 </div>
                 
                 <div className="text-center text-[10px] text-slate-600 mt-4 font-medium">
                     点击下方按钮验证你的推断
                 </div>
             </div>

             {/* Back Side: Detail & Verify Mode */}
             <div className="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 border-2 border-blue-900/50 rounded-2xl flex flex-col p-0 shadow-xl overflow-hidden relative">
                 {/* Back Header */}
                 <div className="bg-slate-950/50 border-b border-slate-800 p-4 flex items-start justify-between shrink-0">
                     <div className="flex-1 min-w-0 pr-2">
                        <h3 className="text-xl font-bold text-slate-200 truncate">{currentItem.text}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-slate-500 font-mono bg-slate-800 px-1.5 rounded">Lv {currentLevel}</span>
                            <button onClick={(e) => { e.stopPropagation(); speak(currentItem.text, speechRate); }} className="text-slate-400 hover:text-white">
                                <Volume2 size={14} />
                            </button>
                        </div>
                     </div>
                     <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold border shrink-0 ${currentRating ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                         {currentRating ? '已掌握' : '需复习'}
                     </div>
                 </div>

                 {/* Back Content - Scrollable */}
                 <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                     
                     {/* Definition Section */}
                     <div className="text-center py-4 bg-emerald-900/10 rounded-xl border border-emerald-500/10">
                        <p className="text-lg text-emerald-400 font-bold mb-1 leading-snug px-2">{currentItem.translation}</p>
                        {currentItem.definition && hasEnglishHint && <p className="text-xs text-slate-500 leading-relaxed px-4 mt-2 border-t border-emerald-500/10 pt-2">{currentItem.definition}</p>}
                     </div>

                     {/* Example Section */}
                     <div className="bg-slate-800/40 p-4 rounded-xl border-l-4 border-blue-500 relative group/example">
                        <p className="text-sm text-slate-200 italic pr-6 mb-2 leading-relaxed">"{currentItem.example}"</p>
                        {currentItem.example_zh && <p className="text-xs text-slate-500 leading-snug">{currentItem.example_zh}</p>}
                        <button onClick={(e) => { e.stopPropagation(); speak(currentItem.example, speechRate); }} className="absolute right-2 top-2 p-2 text-slate-500 hover:text-white transition-colors">
                            <PlayCircle size={16} />
                        </button>
                     </div>

                     {/* Extra Info */}
                     {currentItem.extra_info && (
                         <div className="flex items-start gap-2 bg-amber-900/10 border border-amber-500/20 p-3 rounded-lg text-xs text-amber-200/80">
                            <Sparkles size={14} className="shrink-0 mt-0.5 text-amber-500" />
                            <span>{currentItem.extra_info}</span>
                         </div>
                     )}

                     {/* Pronunciation Evaluation Area */}
                     <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 flex items-center justify-between gap-3">
                         <div className="flex-1 min-w-0">
                             <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">发音评测</div>
                             {pronunciationResult ? (
                                 <div>
                                     <div className="flex items-baseline gap-1">
                                         <span className={`text-lg font-bold ${pronunciationResult.score > 80 ? 'text-emerald-400' : 'text-orange-400'}`}>{pronunciationResult.score}</span>
                                         <span className="text-[10px] text-slate-600">/ 100</span>
                                     </div>
                                     <p className="text-[10px] text-slate-400 line-clamp-1">{pronunciationResult.feedback}</p>
                                 </div>
                             ) : (
                                 <p className="text-[10px] text-slate-600">点击麦克风，大声朗读单词</p>
                             )}
                         </div>
                         <button onClick={toggleRecording} className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${recordingState === 'recording' ? 'bg-red-500 text-white animate-pulse' : (recordingState === 'evaluating' ? 'bg-slate-800 text-slate-500' : 'bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white')}`}>
                            {recordingState === 'recording' ? <Square size={16} fill="currentColor" /> : (recordingState === 'evaluating' ? <Loader2 size={18} className="animate-spin" /> : <Mic size={20} />)}
                         </button>
                     </div>
                 </div>
             </div>
          </div>
       </div>

       <div className={`flex items-center gap-3 mt-4 w-full justify-center shrink-0 pb-2 transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
          {!isFlipped ? (
             <>
                <button onClick={() => handleRate(false)} className="flex-1 py-4 rounded-2xl bg-slate-800 border border-slate-700 text-slate-300 font-bold hover:bg-slate-700 hover:border-red-500/50 hover:text-red-400 transition-all flex justify-center items-center gap-2 active:scale-95 shadow-lg group">
                   <X size={20} className="text-slate-500 group-hover:text-red-400" /> 需复习
                </button>
                <button onClick={() => handleRate(true)} className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 hover:scale-105 shadow-lg shadow-emerald-500/20 transition-all flex justify-center items-center gap-2 active:scale-95">
                   <Check size={20} /> 掌握了
                </button>
             </>
          ) : (
             <button onClick={handleNext} className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all flex justify-center items-center gap-2 animate-in fade-in slide-in-from-bottom-2 shadow-lg shadow-blue-900/20 active:scale-95">
                下一个 <ArrowRight size={20} />
             </button>
          )}
       </div>
    </div>
  );
};
