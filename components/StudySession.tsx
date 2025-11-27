import React, { useState, useRef, useEffect } from 'react';
import { StudyItem, SessionResult } from '../types';
import { Check, X, Volume2, PlayCircle, AlertCircle, Loader2, Sparkles, Mic, Square, HelpCircle, Info, Heart } from 'lucide-react';
import { generateSpeech, evaluatePronunciation } from '../services/contentGen';
import { playAudioFromBase64 } from '../services/audioUtils';

interface StudySessionProps {
  items: StudyItem[];
  initialIndex: number; // Added to support resuming
  onProgress: (index: number) => void; // Callback to save progress
  onComplete: (results: SessionResult[]) => void;
  audioCache: Map<string, string>; // Passed from parent for persistence
}

export const StudySession: React.FC<StudySessionProps> = ({ items, initialIndex, onProgress, onComplete, audioCache }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  
  // Track results for all items in this session
  const [results, setResults] = useState<SessionResult[]>([]);
  // Track collected/saved status independently for visual toggle
  const [collectedIds, setCollectedIds] = useState<Set<string>>(new Set());

  // Initialize collected IDs based on input items
  useEffect(() => {
      const initialSaved = new Set<string>();
      items.forEach(item => {
          if (item.saved) initialSaved.add(item.id);
      });
      setCollectedIds(initialSaved);
  }, [items]); // Only run when items array reference changes (start of session)

  // Pronunciation State
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'evaluating' | 'result'>('idle');
  const [pronunciationResult, setPronunciationResult] = useState<{score: number, feedback: string} | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Update parent progress whenever index changes
  useEffect(() => {
    onProgress(currentIndex);
  }, [currentIndex, onProgress]);

  // Reset function when moving to next card
  const resetCardState = () => {
      setIsFlipped(false);
      setRecordingState('idle');
      setPronunciationResult(null);
  };

  // Guard against empty items
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

  const handleNext = (remembered: boolean) => {
    // Record result for current item
    // We update the 'saved' property based on current heart status
    const currentResult: SessionResult = {
        item: { ...currentItem, saved: collectedIds.has(currentItem.id) },
        remembered
    };
    
    // Use functional update to ensure we don't lose previous results
    const updatedResults = [...results, currentResult];
    setResults(updatedResults);
    
    resetCardState();

    if (currentIndex < items.length - 1) {
      setTimeout(() => setCurrentIndex(prev => prev + 1), 200);
    } else {
      // Finished
      onComplete(updatedResults);
    }
  };

  const playTTS = async (text: string) => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
        // Check passed Cache first
        if (audioCache.has(text)) {
            await playAudioFromBase64(audioCache.get(text)!);
        } else {
            const base64 = await generateSpeech(text);
            if (base64) {
                audioCache.set(text, base64); // Save to prop cache
                await playAudioFromBase64(base64);
            } else {
                // Fallback
                const speech = new SpeechSynthesisUtterance(text);
                speech.lang = 'en-US';
                window.speechSynthesis.speak(speech);
            }
        }
    } catch (e) {
        console.error("Audio error", e);
    } finally {
        setIsPlaying(false);
    }
  };

  const toggleRecording = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (recordingState === 'recording') {
        // Stop
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
        }
    } else {
        // Start
        try {
            setPronunciationResult(null);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
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
                       <h3 className="text-lg font-bold text-white">记忆等级说明</h3>
                       <button onClick={() => setShowHelp(false)}><X size={20} className="text-slate-400" /></button>
                   </div>
                   <div className="space-y-4">
                       <div className="flex gap-3">
                           <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                               <Check size={20} />
                           </div>
                           <div>
                               <h4 className="font-bold text-emerald-400">掌握了 (Mastered)</h4>
                               <p className="text-xs text-slate-400 mt-1">
                                   如果你能立刻认出并读出该单词。选择此项会提升单词的熟悉度等级 (Lv +1)，下次复习间隔会变长。
                               </p>
                           </div>
                       </div>
                       <div className="flex gap-3">
                           <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                               <X size={20} />
                           </div>
                           <div>
                               <h4 className="font-bold text-red-400">需复习 (Review)</h4>
                               <p className="text-xs text-slate-400 mt-1">
                                   如果你犹豫了、不记得意思或发音不准。选择此项会保持或重置等级，确保你下次很快能再次复习它。
                               </p>
                           </div>
                       </div>
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
          
          {/* Collection Button (Visible on both sides) */}
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
            className={`w-full h-full transition-transform duration-500 transform-style-3d relative cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
            onClick={() => {
                if(recordingState !== 'recording') setIsFlipped(!isFlipped);
            }}
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
                 <p className="absolute bottom-8 text-slate-500 text-xs animate-pulse">点击翻转查看</p>
             </div>

             {/* Back */}
             <div className="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 border-2 border-blue-900/50 rounded-2xl flex flex-col items-center justify-center p-6 md:p-8 shadow-xl overflow-y-auto custom-scrollbar">
                 <div className="flex-1 flex flex-col items-center w-full pt-4">
                     <div className="flex items-center gap-3 mb-2">
                        {/* TTS Button */}
                        <button 
                            onClick={(e) => { e.stopPropagation(); playTTS(currentItem.text); }}
                            disabled={isPlaying}
                            className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-blue-400 transition-colors shrink-0 disabled:opacity-50"
                        >
                            {isPlaying ? <Loader2 size={20} className="animate-spin" /> : <Volume2 size={20} />}
                        </button>
                        
                        <h3 className="text-xl font-bold text-slate-200 text-center">{currentItem.text}</h3>
                        
                        {/* Record / Score Button */}
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
                     
                     {/* Score Display */}
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
                     
                     {/* Chinese Translation */}
                     <p className="text-xl text-emerald-400 font-bold mb-3 text-center">{currentItem.translation}</p>
                     
                     {/* English Definition */}
                     <p className="text-sm text-slate-400 text-center mb-4 leading-relaxed px-2">
                        {currentItem.definition}
                     </p>
                     
                     {/* Extra Info (Origin/POS) */}
                     {currentItem.extra_info && (
                         <div className="w-full bg-slate-950/50 border border-slate-800 p-2 rounded-lg mb-4 text-xs text-slate-400 flex items-start gap-2">
                            <Sparkles size={12} className="shrink-0 mt-0.5 text-amber-500" />
                            <span>{currentItem.extra_info}</span>
                         </div>
                     )}

                     {/* Example Sentence */}
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
          {isFlipped ? (
             <>
                <button 
                  onClick={() => handleNext(false)}
                  className="flex-1 py-3 md:py-4 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-medium hover:bg-slate-700 hover:border-red-500/50 hover:text-red-400 transition-all flex justify-center items-center gap-2"
                >
                   <X size={20} /> 需复习
                </button>
                <button 
                  onClick={() => handleNext(true)}
                  className="flex-1 py-3 md:py-4 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 hover:scale-105 shadow-lg shadow-emerald-500/20 transition-all flex justify-center items-center gap-2"
                >
                   <Check size={20} /> 掌握了 (Lv +1)
                </button>
             </>
          ) : (
             <button 
               onClick={() => setIsFlipped(true)}
               className="w-full py-3 md:py-4 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all flex justify-center items-center gap-2"
             >
                查看答案
             </button>
          )}
       </div>
    </div>
  );
};