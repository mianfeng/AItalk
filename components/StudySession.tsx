import React, { useState } from 'react';
import { StudyItem } from '../types';
import { Check, X, Volume2 } from 'lucide-react';

interface StudySessionProps {
  items: StudyItem[];
  onComplete: (masteredItems: StudyItem[]) => void;
}

export const StudySession: React.FC<StudySessionProps> = ({ items, onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mastered, setMastered] = useState<StudyItem[]>([]);

  const currentItem = items[currentIndex];
  const progress = ((currentIndex) / items.length) * 100;

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
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = 'en-US';
    speech.rate = 0.9;
    window.speechSynthesis.speak(speech);
  };

  if (!currentItem) return <div className="text-center p-10">学习完成！</div>;

  return (
    <div className="flex flex-col items-center justify-center h-full w-full max-w-lg mx-auto p-4">
       {/* Progress Bar */}
       <div className="w-full h-1.5 bg-slate-800 rounded-full mb-8 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${progress}%` }} />
       </div>

       {/* Card Container */}
       {/* Using custom css classes: perspective-1000 defined in index.html */}
       <div className="perspective-1000 w-full aspect-[4/3] relative group">
          <div 
            className={`w-full h-full transition-transform duration-500 transform-style-3d relative cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
            onClick={() => setIsFlipped(!isFlipped)}
          >
             {/* Front */}
             <div className="absolute inset-0 backface-hidden bg-slate-800 border-2 border-slate-700 rounded-2xl flex flex-col items-center justify-center p-8 shadow-xl">
                 <span className="text-xs font-semibold tracking-widest text-emerald-400 uppercase mb-4 bg-emerald-900/30 px-3 py-1 rounded-full">
                    {currentItem.type === 'word' ? '单词' : (currentItem.type === 'sentence' ? '句子' : '习语')}
                 </span>
                 <h2 className="text-3xl md:text-4xl font-bold text-center text-slate-100 mb-4">
                    {currentItem.text}
                 </h2>
                 {currentItem.pronunciation && (
                     <p className="text-slate-400 font-mono text-sm">{currentItem.pronunciation}</p>
                 )}
                 <p className="absolute bottom-8 text-slate-500 text-xs animate-pulse">点击翻转</p>
             </div>

             {/* Back */}
             <div className="absolute inset-0 backface-hidden rotate-y-180 bg-slate-900 border-2 border-blue-900/50 rounded-2xl flex flex-col items-center justify-center p-8 shadow-xl">
                 <div className="flex-1 flex flex-col items-center justify-center w-full">
                     <button 
                        onClick={(e) => { e.stopPropagation(); playTTS(currentItem.text); }}
                        className="mb-4 p-3 bg-slate-800 rounded-full hover:bg-slate-700 text-blue-400 transition-colors"
                     >
                        <Volume2 size={24} />
                     </button>
                     <p className="text-lg text-slate-300 text-center mb-6 leading-relaxed">
                        {currentItem.definition}
                     </p>
                     <div className="w-full bg-slate-800/50 p-4 rounded-xl border-l-4 border-blue-500">
                        <p className="text-sm text-slate-400 italic">"{currentItem.example}"</p>
                     </div>
                 </div>
             </div>
          </div>
       </div>

       {/* Controls */}
       <div className="flex items-center gap-6 mt-10 w-full justify-center">
          {isFlipped ? (
             <>
                <button 
                  onClick={() => handleNext(false)}
                  className="flex-1 py-4 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-medium hover:bg-slate-700 hover:border-red-500/50 hover:text-red-400 transition-all flex justify-center items-center gap-2"
                >
                   <X size={20} /> 需复习
                </button>
                <button 
                  onClick={() => handleNext(true)}
                  className="flex-1 py-4 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 hover:scale-105 shadow-lg shadow-emerald-500/20 transition-all flex justify-center items-center gap-2"
                >
                   <Check size={20} /> 掌握了
                </button>
             </>
          ) : (
             <button 
               onClick={() => setIsFlipped(true)}
               className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-all flex justify-center items-center gap-2"
             >
                查看答案
             </button>
          )}
       </div>
    </div>
  );
};