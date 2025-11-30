import React, { useState, useRef, useEffect } from 'react';
import { StudyItem, SessionResult } from '../types';
import { Check, X, Volume2, PlayCircle, AlertCircle, Loader2, Sparkles, Mic, Square, HelpCircle, Heart, ArrowRight, BarChart, Settings2 } from 'lucide-react';
import { evaluatePronunciation } from '../services/contentGen';
import { getPreferredVoice } from '../services/audioUtils';

interface StudySessionProps {
  items: StudyItem[];
  initialIndex: number; 
  onProgress: (index: number) => void;
  onComplete: (results: SessionResult[]) => void;
}

export const StudySession: React.FC<StudySessionProps> = ({ items, initialIndex, onProgress, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  
  // TTS State
  const [speechRate, setSpeechRate] = useState(1.0); // 1.0, 0.75, 0.5
  const [preferredVoice, setPreferredVoice] = useState<SpeechSynthesisVoice | null>(null);

  // New State for "Rate First" flow
  // null = not rated yet (Front side)
  // boolean = rated (Back side), true = mastered, false = review
  const [currentRating, setCurrentRating] = useState<boolean | null>(null);

  const [results, setResults] = useState<SessionResult[]>([]);
  const [collectedIds, setCollectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
      const initialSaved = new Set<string>();
      items.forEach(item => {
          if (item.saved) initialSaved.add(item.id);
      });
      setCollectedIds(initialSaved);
  }, [items]);

  // Load Voices logic
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const savedURI = localStorage.getItem('lingua_voice_uri');
      const bestVoice = getPreferredVoice(voices, savedURI);
      if (bestVoice) setPreferredVoice(bestVoice);
    };

    loadVoices();
    // Chrome loads voices asynchronously
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'evaluating' | 'result'>('idle');
  const [pronunciationResult, setPronunciationResult] = useState<{score: number, feedback: string} | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    onProgress(currentIndex);
  }, [currentIndex, onProgress]);

  const resetCardState = () => {
      setIsFlipped(false);
      setCurrentRating(null);
      setRecordingState('idle');
      setPronunciationResult(null);
  };

  if (!items || items.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6">
              <AlertCircle size={48} className="mb-4 text-slate-600" />
              <p>暂无学习内容，请返回重新生成。</p>
          </div>
      );
  }

  const currentItem = items[currentIndex];
  const progress = items.length > 0 ? ((currentIndex) / items.length) * 100 : 0;
  const isCollected = collectedIds.has(currentItem?.id);
  const currentLevel = typeof currentItem.masteryLevel === 'number' ? currentItem.masteryLevel : 0;

  const toggleCollect = (e: React.MouseEvent) => {
      e.stopPropagation();
      const newSet = new Set(collectedIds);
      if (newSet.has(currentItem.id)) {
          newSet.delete(currentItem.id);
      } else {
          newSet.add(currentItem.id);
      }
      setCollectedIds(newSet);
  };

  // Step 1: User rates the item (Front -> Back)
  const handleRate = (mastered: boolean) => {
      setCurrentRating(mastered);
      setIsFlipped(true);
      // Optional: Auto-play audio on flip could be added here
  };

  // Step 2: User clicks Next (Back -> Next Card)
  const handleNext = () => {
    if (currentRating === null) return;

    const currentResult: SessionResult = {
        item: { ...currentItem, saved: collectedIds.has(currentItem.id) },
        remembered: currentRating
    };
    
    const updatedResults = [...results, currentResult];
    setResults(updatedResults);
    
    if (currentIndex < items.length - 1) {
      // Small delay for animation feel
      setTimeout(() => {
          resetCardState();
          setCurrentIndex(prev => prev + 1);
      }, 150);
    } else {
      onComplete(updatedResults);
    }
  };

  const playTTS = (text: string) => {
    if (isPlaying) {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
        return;
    }
    
    setIsPlaying(true);
    
    // Cancel any previous utterance
    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = 'en-US';
    speech.rate = speechRate;
    
    if (preferredVoice) {
        speech.voice = preferredVoice;
    }

    speech.onend = () => {
        setIsPlaying(false);
    };

    speech.onerror = (e) => {
        console.error("Speech synthesis error", e);
        setIsPlaying(false);
    };

    window.speechSynthesis.speak(speech);
  };

  const toggleSpeed = (e: React.MouseEvent) => {
      e.stopPropagation();
      // Cycle: 1.0 -> 0.75 -> 0.5 -> 1.0
      setSpeechRate(prev => {
          if (prev === 1.0) return 0.75;
          if (prev === 0.75) return 0.5;
          return 1.0;
      });
  };

  const toggleRecording = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (recordingState === 'recording') {
        if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    } else {
        try {
            setPronunciationResult(null);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };
            mediaRecorder.onstop = async () => {
                setRecordingState('evaluating');
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64String = (reader.result as string).split(',')[1];
                    const result = await evaluatePronunciation(base64String, currentItem.text);
                    setPronunciationResult(result);
                    setRecordingState('result');
                };
                stream.getTracks().forEach(track => track.stop());
            };
            mediaRecorder.start();
            setRecordingState('recording');
        } catch (err) {
            console.error("Mic failed", err);
            alert("无法访问麦克风");
        }
    }
  };

  if (!currentItem) return <div className="text-center p-10 text-slate-300">学习完成！</div>;

  return (
    <div className="flex flex-col items-center h-full w-full max-w-md mx-auto p-4 relative">
       
       {/* Help Modal */}
       {showHelp && (
           <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setShowHelp(false)}>
               <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="text-lg font-bold text-white">学习模式说明</h3>
                       <button onClick={() => setShowHelp(false)}><X size={20} className="text-slate-400" /></button>
                   </div>
                   <div className="space-y-4">
                       <p className="text-slate-300 text-sm">
                           1. 看到单词后，先在心里回忆意思和发音。<br/>
                           2. 根据回忆情况，选择 <b>"需复习"</b> 或 <b>"掌握了"</b>。<br/>
                           3. 卡片翻转，查看答案和例句，然后点击 <b>"下一个"</b>。
                       </p>
                   </div>
               </div>
           </div>
       )}

       <div className="absolute top-3 right-4 z-10">
           <button onClick={() => setShowHelp(true)} className="p-2 text-slate-500 hover:text-white transition-colors">
               <HelpCircle size={20} />
           </button>
       </div>

       {/* Progress Bar - Reduced margin */}
       <div className="w-full h-1 bg-slate-800 rounded-full mb-4 mt-2 overflow-hidden shrink-0">
          <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
       </div>

       {/* Card Container - Reduced height constraints for compact view */}
       <div className="perspective-1000 w-full flex-1 max-h-[42vh] min-h-[240px] relative group my-auto">
          
          <button 
             onClick={toggleCollect}
             className="absolute top-3 right-3 z-20 p-2.5 rounded-full hover:bg-slate-900/50 transition-colors"
          >
              <Heart 
                size={22} 
                className={`transition-all ${isCollected ? 'text-red-500 fill-red-500 scale-110' : 'text-slate-500 hover:text-red-400'}`} 
              />
          </button>

          <div 
            className={`w-full h-full transition-transform duration-500 transform-style-3d relative ${isFlipped ? 'rotate-y-180' : ''}`}
          >
             {/* Front - Compact padding and typography */}
             <div className="absolute inset-0 backface-hidden bg-slate-800 border-2 border-slate-700 rounded-2xl flex flex-col items-center justify-center p-3 shadow-xl">
                 <span className="text-[10px] font-semibold tracking-widest text-emerald-400 uppercase mb-2 bg-emerald-900/30 px-2.5 py-0.5 rounded-full">
                    {currentItem.type === 'word' ? '单词' : (currentItem.type === 'sentence' ? '句子' : '习语')}
                 </span>
                 
                 <h2 className="text-xl md:text-2xl font-bold text-center text-slate-100 mb-2 select-none px-2 break-words max-w-full leading-tight">
                    {currentItem.text}
                 </h2>
                 
                 {currentItem.pronunciation && (
                     <p className="text-slate-400 font-mono text-xs mb-2">{currentItem.pronunciation}</p>
                 )}
                 
                 {/* Audio Control Row */}
                 <div className="mt-4 flex items-center gap-3">
                     <button 
                        onClick={(e) => { e.stopPropagation(); playTTS(currentItem.text); }}
                        className={`p-3 rounded-full hover:bg-slate-600 transition-colors ${isPlaying ? 'bg-slate-600 text-blue-400' : 'bg-slate-700 text-slate-200'}`}
                     >
                        {isPlaying ? <Loader2 size={22} className="animate-spin" /> : <Volume2 size={22} />}
                     </button>
                     
                     <button 
                        onClick={toggleSpeed}
                        className="h-9 px-3 rounded-full bg-slate-700/50 border border-slate-600 text-xs font-mono text-slate-400 hover:text-white hover:bg-slate-600 transition-colors"
                        title="点击调整语速"
                     >
                         {speechRate}x
                     </button>
                 </div>
             </div>

             {/* Back */}
             <div className="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 border-2 border-blue-900/50 rounded-2xl flex flex-col items-center justify-center p-4 shadow-xl overflow-y-auto custom-scrollbar relative">
                 
                 {/* Mastery Level Indicator */}
                 <div className="absolute top-3 left-4 flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded-lg border border-slate-700">
                    <BarChart size={10} className="text-blue-400" />
                    <span className="text-[10px] text-slate-400 font-medium">
                        Lv {currentLevel}
                    </span>
                 </div>

                 <div className="flex-1 flex flex-col items-center w-full pt-4 md:pt-6">
                     {/* Result Badge */}
                     <div className={`mb-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${currentRating ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                         {currentRating ? '已掌握' : '需复习'}
                     </div>

                     <div className="flex items-center gap-3 mb-2 w-full justify-center px-2">
                        <h3 className="text-lg md:text-xl font-bold text-slate-200 text-center truncate">{currentItem.text}</h3>
                        
                        <button
                            onClick={toggleRecording}
                            className={`p-1.5 rounded-full transition-all shrink-0 relative ${
                                recordingState === 'recording' 
                                ? 'bg-red-500 text-white animate-pulse' 
                                : (recordingState === 'evaluating' 
                                    ? 'bg-slate-700 text-slate-400 cursor-wait'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
                                )
                            }`}
                        >
                            {recordingState === 'recording' ? <Square size={16} fill="currentColor" /> : 
                             (recordingState === 'evaluating' ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />)}
                        </button>
                     </div>
                     
                     {recordingState === 'result' && pronunciationResult && (
                         <div className="mb-2 animate-in fade-in zoom-in duration-300 flex flex-col items-center bg-slate-950/50 rounded-lg p-2 border border-slate-800">
                             <div className={`text-[10px] font-bold mb-0.5 ${
                                 pronunciationResult.score > 80 ? 'text-emerald-400' : 'text-orange-400'
                             }`}>
                                 发音评分: {pronunciationResult.score}
                             </div>
                             <p className="text-[10px] text-slate-500 text-center max-w-[200px] leading-tight">{pronunciationResult.feedback}</p>
                         </div>
                     )}
                     
                     <p className="text-base text-emerald-400 font-bold mb-2 text-center px-2 leading-tight">{currentItem.translation}</p>
                     
                     {currentItem.definition && currentItem.definition.trim() !== '' && (
                        <p className="text-xs text-slate-400 text-center mb-2 leading-relaxed px-4 line-clamp-2">
                            {currentItem.definition}
                        </p>
                     )}
                     
                     {currentItem.extra_info && (
                         <div className="w-full bg-slate-950/50 border border-slate-800 p-1.5 rounded-lg mb-2 text-[10px] text-slate-400 flex items-start gap-2">
                            <Sparkles size={10} className="shrink-0 mt-0.5 text-amber-500" />
                            <span className="line-clamp-2">{currentItem.extra_info}</span>
                         </div>
                     )}

                     <div className="w-full bg-slate-800/50 p-3 rounded-xl border-l-4 border-blue-500 relative group/example mt-auto mb-1">
                        <p className="text-xs text-slate-300 italic pr-6 mb-1 leading-snug">"{currentItem.example}"</p>
                        {currentItem.example_zh && (
                            <p className="text-[10px] text-slate-500 leading-snug">{currentItem.example_zh}</p>
                        )}
                        <button 
                            onClick={(e) => { e.stopPropagation(); playTTS(currentItem.example); }}
                            className="absolute right-1 top-1 p-2 text-slate-500 hover:text-white transition-colors"
                        >
                            <PlayCircle size={14} />
                        </button>
                     </div>
                 </div>
             </div>
          </div>
       </div>

       {/* Controls - Reduced Margin and Compactness */}
       <div className="flex items-center gap-3 mt-4 w-full justify-center shrink-0 pb-2">
          {!isFlipped ? (
             <>
                <button 
                  onClick={() => handleRate(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-medium hover:bg-slate-700 hover:border-red-500/50 hover:text-red-400 transition-all flex justify-center items-center gap-2 text-sm md:text-base"
                >
                   <X size={18} /> 需复习
                </button>
                <button 
                  onClick={() => handleRate(true)}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 hover:scale-105 shadow-lg shadow-emerald-500/20 transition-all flex justify-center items-center gap-2 text-sm md:text-base"
                >
                   <Check size={18} /> 掌握了
                </button>
             </>
          ) : (
             <button 
               onClick={handleNext}
               className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all flex justify-center items-center gap-2 animate-in fade-in text-sm md:text-base"
             >
                下一个 <ArrowRight size={18} />
             </button>
          )}
       </div>
    </div>
  );
};