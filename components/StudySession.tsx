
import React, { useState, useEffect, useRef } from 'react';
import { StudyItem, SessionResult } from '../types';
import { Check, X, Volume2, PlayCircle, AlertCircle, Loader2, Sparkles, Mic, Square, HelpCircle, Heart, ArrowRight, ArrowLeft, Eye, EyeOff, BarChart2 } from 'lucide-react';
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
          <div className="flex flex-col items-center justify-center h-full text-stone-500 p-6">
              <AlertCircle size={48} className="mb-4 text-[#8F9EAC]" />
              <p>{!items || items.length === 0 ? '暂无学习内容，请返回重新生成。' : '学习完成！'}</p>
              <button onClick={onBack} className="mt-6 px-6 py-2 bg-stone-700 rounded-full text-sm text-stone-300 border border-stone-600">返回首页</button>
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
           <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowHelp(false)}>
               <div className="glass rounded-xl p-6 max-w-sm w-full shadow-2xl bg-[#2E3440]" onClick={e => e.stopPropagation()}>
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-lg font-bold text-[#ECEFF4]">学习模式说明</h3>
                       <button onClick={() => setShowHelp(false)}><X size={20} className="text-stone-400" /></button>
                   </div>
                   <div className="space-y-4">
                       <p className="text-stone-400 text-sm">
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
                             className="w-4 h-4 rounded border-stone-600 bg-stone-700 text-[#8F9EAC] focus:ring-[#8F9EAC]"
                           />
                           <label htmlFor="autoplay" className="text-sm text-stone-400">自动播放单词发音</label>
                       </div>
                   </div>
               </div>
           </div>
       )}

       <div className="absolute top-3 left-4 z-10">
           <button onClick={onBack} className="p-2 text-stone-400 hover:text-white transition-colors"><ArrowLeft size={22} /></button>
       </div>
       <div className="absolute top-3 right-4 z-10 flex gap-2">
           <button onClick={() => setShowHelp(true)} className="p-2 text-stone-400 hover:text-white transition-colors"><HelpCircle size={20} /></button>
       </div>

       <div className="w-full h-1.5 bg-white/10 rounded-full mb-6 mt-12 overflow-hidden shrink-0">
          {/* Muted Blue Progress Bar */}
          <div className="h-full bg-[#8F9EAC] transition-all duration-500" style={{ width: `${progress}%` }} />
       </div>

       {/* Card Container */}
       <div className={`perspective-1000 w-full flex-1 max-h-[60vh] min-h-[380px] relative group my-auto transition-all duration-300 ${isTransitioning ? 'opacity-0 translate-x-[-20px] scale-95' : 'opacity-100 translate-x-0 scale-100'}`}>
          
          <div className={`w-full h-full transition-transform duration-500 transform-style-3d relative ${isFlipped ? 'rotate-y-180' : ''}`}>
             
             {/* Front Side: Twilight Blue Gradient - Dark */}
             <div className="absolute inset-0 backface-hidden bg-gradient-to-br from-[#4C566A] to-[#3B4252] border border-white/5 rounded-3xl flex flex-col p-5 shadow-2xl backdrop-blur-sm">
                 <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col items-start gap-1.5">
                        {currentLevel === 0 && <span className="text-[10px] font-bold text-[#EBCB8B] bg-white/10 px-2 py-0.5 rounded border border-white/10 shadow-sm">New</span>}
                        <span className="text-[10px] font-semibold tracking-widest text-stone-400 uppercase bg-black/20 px-2.5 py-0.5 rounded-full border border-white/5">
                            {currentItem.type}
                        </span>
                    </div>
                    <button onClick={toggleCollect} className={`p-2 rounded-full hover:bg-black/20 transition-all ${isCollected ? 'text-[#BF616A] fill-[#BF616A]' : 'text-stone-500 hover:text-[#BF616A]'}`}>
                        <Heart size={22} />
                    </button>
                 </div>
                 
                 <div className="flex-1 flex flex-col items-center justify-center -mt-6">
                     <h2 className="text-3xl font-bold text-center text-[#ECEFF4] mb-3 select-none px-2 break-words max-w-full leading-tight drop-shadow-md">{currentItem.text}</h2>
                     
                     <div className="flex items-center gap-4 mb-6">
                         <button onClick={(e) => { e.stopPropagation(); speak(currentItem.text, speechRate); }} className={`w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition-all shadow-lg border border-white/10 ${isPlaying ? 'bg-white/20 text-[#ECEFF4] scale-110' : 'bg-white/5 text-stone-400 hover:scale-105'}`}>
                            {isPlaying ? <Loader2 size={20} className="animate-spin" /> : <Volume2 size={20} />}
                         </button>
                         {currentItem.pronunciation && (
                             <span className="text-stone-400 font-mono text-xs tracking-wider bg-black/20 px-3 py-1.5 rounded-lg border border-white/5">{currentItem.pronunciation}</span>
                         )}
                     </div>

                     {/* Context Area - Dark Glass */}
                     <div className="w-full bg-black/20 rounded-2xl p-4 border border-white/5 mb-2 shadow-inner">
                        <div className="text-xs text-stone-400 uppercase tracking-widest mb-2 font-bold flex items-center gap-2">
                            <Sparkles size={12} className="text-[#EBCB8B]" /> 语境例句
                        </div>
                        <p className="text-[#D8DEE9] text-sm leading-relaxed italic line-clamp-4 font-light">
                            "{currentItem.example}"
                        </p>
                     </div>

                     {/* English Hint Toggle */}
                     {hasEnglishHint && (
                         <div className="w-full mt-2">
                             <button 
                                onClick={(e) => { e.stopPropagation(); setShowEnglishHint(!showEnglishHint); }}
                                className="flex items-center gap-2 text-xs text-stone-500 hover:text-stone-300 transition-colors mx-auto py-2"
                             >
                                 {showEnglishHint ? <EyeOff size={14} /> : <Eye size={14} />}
                                 {showEnglishHint ? "隐藏释义" : "查看英文释义"}
                             </button>
                             
                             <div className={`overflow-hidden transition-all duration-300 ${showEnglishHint ? 'max-h-20 opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                                 <p className="text-xs text-stone-400 text-center bg-black/30 p-2 rounded-lg border border-white/5">
                                     {currentItem.definition}
                                 </p>
                             </div>
                         </div>
                     )}
                 </div>
                 
                 <div className="text-center text-[10px] text-stone-500 mt-2 font-medium">
                     点击下方按钮验证
                 </div>
             </div>

             {/* Back Side: Dark Muted Grey */}
             <div className="absolute inset-0 backface-hidden rotate-y-180 bg-[#2E3440] border border-[#434C5E] rounded-3xl flex flex-col p-0 shadow-2xl overflow-hidden relative">
                 {/* Back Header */}
                 <div className="bg-black/20 border-b border-white/5 p-4 flex items-center justify-between shrink-0 h-16">
                     <div className="flex items-center gap-3 overflow-hidden">
                        <h3 className="text-xl font-bold text-[#ECEFF4] truncate max-w-[140px]">{currentItem.text}</h3>
                        <button onClick={(e) => { e.stopPropagation(); speak(currentItem.text, speechRate); }} className="text-stone-400 hover:text-white shrink-0">
                            <Volume2 size={18} />
                        </button>
                     </div>
                     <div className="flex items-center gap-2 shrink-0">
                         {currentRating !== null && (
                             <div className={`px-2 py-0.5 rounded text-[10px] font-bold border ${currentRating ? 'bg-[#A3BE8C]/10 text-[#A3BE8C] border-[#A3BE8C]/30' : 'bg-[#BF616A]/10 text-[#BF616A] border-[#BF616A]/30'}`}>
                                 {currentRating ? '已掌握' : '需复习'}
                             </div>
                         )}
                         <button onClick={toggleCollect} className={`p-1.5 rounded-full hover:bg-white/10 transition-colors ${isCollected ? 'text-[#BF616A] fill-[#BF616A]' : 'text-stone-500'}`}>
                             <Heart size={18} />
                         </button>
                     </div>
                 </div>

                 {/* Back Content */}
                 <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col">
                     
                     {/* Definition Section */}
                     <div className="text-center py-3 bg-white/5 rounded-2xl border border-white/5 mb-3 shrink-0">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/10 bg-black/20 mb-2">
                            <BarChart2 size={10} className="text-stone-500" />
                            <span className="text-[10px] text-stone-400 font-mono">Lv {currentLevel}</span>
                        </div>
                        <p className="text-lg text-[#88C0D0] font-bold leading-snug px-3">{currentItem.translation}</p>
                        {currentItem.definition && hasEnglishHint && <p className="text-[10px] text-stone-500 leading-relaxed px-4 mt-2 border-t border-white/5 pt-2 line-clamp-2">{currentItem.definition}</p>}
                     </div>

                     {/* Example Section - Flexible growth */}
                     <div className="bg-[#3B4252] p-3 rounded-2xl border-l-4 border-[#81A1C1] relative group/example shadow-sm mb-3">
                        <p className="text-xs text-[#D8DEE9] italic pr-6 mb-2 leading-relaxed">"{currentItem.example}"</p>
                        {currentItem.example_zh && <p className="text-[10px] text-stone-400 leading-snug">{currentItem.example_zh}</p>}
                        <button onClick={(e) => { e.stopPropagation(); speak(currentItem.example, speechRate); }} className="absolute right-2 top-2 p-1.5 text-stone-500 hover:text-white transition-colors">
                            <PlayCircle size={16} />
                        </button>
                     </div>

                     {/* Compact Bottom Grid: Source & Pronunciation */}
                     <div className="grid grid-cols-2 gap-2 mt-auto">
                         {/* Source Block */}
                         <div className="bg-black/20 rounded-xl p-3 border border-white/5 flex flex-col justify-center min-h-[70px]">
                             <div className="flex items-center gap-1.5 mb-1.5 opacity-80">
                                <Sparkles size={12} className="text-[#EBCB8B]" />
                                <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">来源</span>
                             </div>
                             <p className="text-[10px] text-stone-300 line-clamp-2 leading-tight font-medium">
                                {currentItem.extra_info || "通用词库"}
                             </p>
                         </div>

                         {/* Pronunciation Evaluation Block */}
                         <div className="bg-black/20 rounded-xl p-2 border border-white/5 flex flex-col items-center justify-center min-h-[70px] relative">
                             {pronunciationResult ? (
                                 <div className="w-full text-center">
                                     <div className="flex items-baseline justify-center gap-0.5">
                                         <span className={`text-xl font-black ${pronunciationResult.score > 80 ? 'text-[#A3BE8C]' : 'text-[#EBCB8B]'}`}>{pronunciationResult.score}</span>
                                         <span className="text-[8px] text-stone-600">/100</span>
                                     </div>
                                     <div className="text-[9px] text-stone-400 truncate w-full px-1">{pronunciationResult.feedback}</div>
                                 </div>
                             ) : (
                                 <>
                                    <div className="text-[9px] text-stone-500 font-bold mb-1">发音评测</div>
                                    <button onClick={toggleRecording} className={`w-8 h-8 rounded-full flex items-center justify-center transition-all border border-white/10 ${recordingState === 'recording' ? 'bg-[#BF616A] text-white animate-pulse' : 'bg-[#4C566A] text-stone-300'}`}>
                                        {recordingState === 'recording' ? <Square size={12} fill="currentColor" /> : (recordingState === 'evaluating' ? <Loader2 size={14} className="animate-spin" /> : <Mic size={16} />)}
                                    </button>
                                 </>
                             )}
                         </div>
                     </div>
                 </div>
             </div>
          </div>
       </div>

       {/* Action Buttons */}
       <div className={`flex items-center gap-3 mt-4 w-full justify-center shrink-0 pb-6 transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
          {!isFlipped ? (
             <>
                <button onClick={() => handleRate(false)} className="flex-1 py-3.5 rounded-2xl bg-[#3B4252] border border-[#4C566A] text-stone-400 font-bold hover:bg-[#434C5E] hover:text-[#BF616A] transition-all flex justify-center items-center gap-2 active:scale-95 shadow-lg group text-sm">
                   <X size={18} className="text-stone-500 group-hover:text-[#BF616A]" /> 需复习
                </button>
                <button onClick={() => handleRate(true)} className="flex-1 py-3.5 rounded-2xl bg-[#8F9EAC] text-[#ECEFF4] font-bold hover:shadow-lg hover:bg-[#81A1C1] shadow-md transition-all flex justify-center items-center gap-2 active:scale-95 text-sm border border-[#81A1C1]/50">
                   <Check size={18} /> 掌握了
                </button>
             </>
          ) : (
             <button onClick={handleNext} className="w-full py-3.5 rounded-2xl bg-[#5E81AC] text-white font-bold hover:bg-[#81A1C1] transition-all flex justify-center items-center gap-2 animate-in fade-in slide-in-from-bottom-2 shadow-lg active:scale-95 text-sm border border-[#81A1C1]/50">
                下一个 <ArrowRight size={18} />
             </button>
          )}
       </div>
    </div>
  );
};
