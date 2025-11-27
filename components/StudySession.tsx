import React, { useState } from 'react';
import { StudyItem } from '../types';
import { Check, X, Volume2, PlayCircle, AlertCircle } from 'lucide-react';

interface StudySessionProps {
  items: StudyItem[];
  onComplete: (masteredItems: StudyItem[]) => void;
}

export const StudySession: React.FC<StudySessionProps> = ({ items, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mastered, setMastered] = useState<StudyItem[]>([]);

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
  // Safe calculation for progress
  const progress = items.length > 0 ? ((currentIndex) / items.length) * 100 : 0;

  const handleNext = (remembered: boolean) => {
    if (remembered) {
      setMastered(prev => [...prev, currentItem]);
    }
    
    setIsFlipped(false);
    if (currentIndex < items.length - 1) {
      setTimeout(() => setCurrentIndex(prev => prev + 1), 200);
    } else {
      // Finished
      const finalMastered = remembered ? [...mastered, currentItem] : mastered;
      onComplete(finalMastered);
    }
  };

  const playTTS = (text: string) => {
    // Simple browser TTS
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = 'en-US';
    speech.rate = 0.9;
    window.speechSynthesis.speak(speech);
  };

  if (!currentItem) return <div className="text-center p-10 text-slate-300">学习完成！</div>;

  return (
    <div className="flex flex-col items-center justify-center h-full w-full max-w-lg mx-auto p-4 md:p-6">
       {/* Progress Bar */}
       <div className="w-full h-1.5 bg-slate-800 rounded-full mb-8 overflow-hidden shrink-0">
          <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
       </div>

       {/* Card Container */}
       <div className="perspective-1000 w-full aspect-[4/5] md:aspect-[4/3] relative group shrink-0">
          <div 
            className={`w-full h-full transition-transform duration-500 transform-style-3d relative cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
            onClick={() => setIsFlipped(!isFlipped)}
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
             <div className="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 border-2 border-blue-900/50 rounded-2xl flex flex-col items-center justify-center p-6 md:p-8 shadow-xl overflow-y-auto">
                 <div className="flex-1 flex flex-col items-center justify-center w-full">
                     <div className="flex items-center gap-2 mb-2">
                        <button 
                            onClick={(e) => { e.stopPropagation(); playTTS(currentItem.text); }}
                            className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 text-blue-400 transition-colors shrink-0"
                        >
                            <Volume2 size={20} />
                        </button>
                        <h3 className="text-xl font-bold text-slate-200 text-center">{currentItem.text}</h3>
                     </div>
                     
                     {/* Chinese Translation */}
                     <p className="text-xl text-emerald-400 font-bold mb-4 text-center">{currentItem.translation}</p>
                     
                     {/* English Definition */}
                     <p className="text-sm text-slate-400 text-center mb-6 leading-relaxed px-2">
                        {currentItem.definition}
                     </p>

                     {/* Example Sentence */}
                     <div className="w-full bg-slate-800/50 p-4 rounded-xl border-l-4 border-blue-500 relative group/example">
                        <p className="text-sm text-slate-300 italic pr-8">"{currentItem.example}"</p>
                        <button 
                            onClick={(e) => { e.stopPropagation(); playTTS(currentItem.example); }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-white transition-colors"
                        >
                            <PlayCircle size={18} />
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
                   <Check size={20} /> 掌握了
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