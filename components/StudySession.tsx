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
    <div className="flex flex-col items-center justify-center h-full w-full max-w-lg mx-auto p-4 md:p-6 relative">
       
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

       <div className="absolute top-4 right-4 z-10">
           <button onClick={() => setShowHelp(true)} className="p-2 text-slate-500 hover:text-white transition-colors">
               <HelpCircle size={20} />
           </button>
       </div>

       {/* Progress Bar */}
       <div className="w-full h-1.5 bg-slate-800 rounded-full mb-8 overflow-hidden shrink-0">
          <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
       </div>

       {/* Card Container */}
       <div className="perspective-1000 w-full aspect-[4/5] md:aspect-[4/3] relative group shrink-0">
          
          <button 
             onClick={toggleCollect}
             className="absolute top-4 right-4 z-20 p-3 rounded-full hover:bg-slate-900/50 transition-colors"
          >
              <Heart 
                size={24} 
                className={`transition-all ${isCollected ? 'text-red-500 fill-red-500 scale-110' : 'text-slate-500 hover:text-red-400'}`} 
              />
          </button>

          <div 
            className={`w-full h-full transition-transform duration-500 transform-style-3d relative ${isFlipped ? 'rotate-y-180' : ''}`}
          >
             {/* Front */}
             <div className="absolute inset-0 backface-hidden bg-slate-800 border-2 border-slate-700 rounded-2xl flex flex-col items-center justify-center p-8 shadow-xl">
                 <span className="text-xs font-semibold tracking-widest text-emerald-400 uppercase mb-4 bg-emerald-900/30 px-3 py-1 rounded-full">
                    {currentItem.type === 'word' ? '单词' : (currentItem.type === 'sentence' ? '句子' : '习语')}
                 </span>
                 <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-100 mb-4 select-none">
                    {currentItem.text}
                 </h2>
                 {currentItem.pronunciation && (
                     <p className="text-slate-400 font-mono text-sm">{currentItem.pronunciation}</p>
                 )}
                 {/* Audio Control Row */}
                 <div className="mt-8 flex items-center gap-3">
                     <button 
                        onClick={(e) => { e.stopPropagation(); playTTS(currentItem.text); }}
                        className={`p-3 rounded-full hover:bg-slate-600 transition-colors ${isPlaying ? 'bg-slate-600 text-blue-400' : 'bg-slate-700 text-slate-200'}`}
                     >
                        {isPlaying ? <Loader2 size={24} className="animate-spin" /> : <Volume2 size={24} />}
                     </button>
                     
                     <button 
                        onClick={toggleSpeed}
                        className="h-10 px-3 rounded-full bg-slate-700/50 border border-slate-600 text-xs font-mono text-slate-400 hover:text-white hover:bg-slate-600 transition-colors"
                        title="点击调整语速"
                     >
                         {speechRate}x
                     </button>
                 </div>
             </div>

             {/* Back */}
             <div className="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 border-2 border-blue-900/50 rounded-2xl flex flex-col items-center justify-center p-6 md:p-8 shadow-xl overflow-y-auto custom-scrollbar relative">
                 
                 {/* Mastery Level Indicator */}
                 <div className="absolute top-4 left-4 flex items-center gap-1.5 px-2 py-1 bg-slate-800 rounded-lg border border-slate-700">
                    <BarChart size={12} className="text-blue-400" />
                    <span className="text-[10px] text-slate-400 font-medium">
                        当前等级: <span className="text-blue-300">Lv {currentLevel}</span>
                    </span>
                 </div>

                 <div className="flex-1 flex flex-col items-center w-full pt-8">
                     {/* Result Badge */}
                     <div className={`mb-4 px-3 py-1 rounded-full text-xs font-bold border ${currentRating ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                         {currentRating ? '已掌握' : '需复习'}
                     </div>

                     <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-slate-200 text-center">{currentItem.text}</h3>
                        
                        <button
                            onClick={toggleRecording}
                            className={`p-2 rounded-full transition-all shrink-0 relative ${
                                recordingState === 'recording' 
                                ? 'bg-red-500 text-white animate-pulse' 
                                : (recordingState === 'evaluating' 
                                    ? 'bg-slate-700 text-slate-400 cursor-wait'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
                                )
                            }`}
                        >
                            {recordingState === 'recording' ? <Square size={20} fill="currentColor" /> : 
                             (recordingState === 'evaluating' ? <Loader2 size={20} className="animate-spin" /> : <Mic size={20} />)}
                        </button>
                     </div>
                     
                     {recordingState === 'result' && pronunciationResult && (
                         <div className="mb-3 animate-in fade-in zoom-in duration-300 flex flex-col items-center">
                             <div className={`px-3 py-1 rounded-full text-xs font-bold mb-1 ${
                                 pronunciationResult.score > 80 
                                 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                 : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                             }`}>
                                 发音评分: {pronunciationResult.score}
                             </div>
                             <p className="text-[10px] text-slate-500">{pronunciationResult.feedback}</p>
                         </div>
                     )}
                     
                     <p className="text-xl text-emerald-400 font-bold mb-3 text-center">{currentItem.translation}</p>
                     
                     {currentItem.definition && currentItem.definition.trim() !== '' && (
                        <p className="text-sm text-slate-400 text-center mb-4 leading-relaxed px-2">
                            {currentItem.definition}
                        </p>
                     )}
                     
                     {currentItem.extra_info && (
                         <div className="w-full bg-slate-950/50 border border-slate-800 p-2 rounded-lg mb-4 text-xs text-slate-400 flex items-start gap-2">
                            <Sparkles size={12} className="shrink-0 mt-0.5 text-amber-500" />
                            <span>{currentItem.extra_info}</span>
                         </div>
                     )}

                     <div className="w-full bg-slate-800/50 p-4 rounded-xl border-l-4 border-blue-500 relative group/example">
                        <p className="text-sm text-slate-300 italic pr-8 mb-1">"{currentItem.example}"</p>
                        {currentItem.example_zh && (
                            <p className="text-xs text-slate-500">{currentItem.example_zh}</p>
                        )}
                        <button 
                            onClick={(e) => { e.stopPropagation(); playTTS(currentItem.example); }}
                            className="absolute right-2 top-2 p-2 text-slate-500 hover:text-white transition-colors"
                        >
                            <PlayCircle size={16} />
                        </button>
                     </div>
                 </div>
             </div>
          </div>
       </div>

       {/* Controls */}
       <div className="flex items-center gap-4 md:gap-6 mt-8 w-full justify-center shrink-0">
          {!isFlipped ? (
             <>
                <button 
                  onClick={() => handleRate(false)}
                  className="flex-1 py-3 md:py-4 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-medium hover:bg-slate-700 hover:border-red-500/50 hover:text-red-400 transition-all flex justify-center items-center gap-2"
                >
                   <X size={20} /> 需复习
                </button>
                <button 
                  onClick={() => handleRate(true)}
                  className="flex-1 py-3 md:py-4 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 hover:scale-105 shadow-lg shadow-emerald-500/20 transition-all flex justify-center items-center gap-2"
                >
                   <Check size={20} /> 掌握了
                </button>
             </>
          ) : (
             <button 
               onClick={handleNext}
               className="w-full py-3 md:py-4 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all flex justify-center items-center gap-2 animate-in fade-in"
             >
                下一个 <ArrowRight size={20} />
             </button>
          )}
       </div>
    </div>
  );
};
