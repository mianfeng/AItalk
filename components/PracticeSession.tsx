
import React, { useState } from 'react';
import { PracticeExercise } from '../types';
import { CheckCircle2, XCircle, ArrowRight, Sparkles, Volume2, Loader2, Info } from 'lucide-react';
import { playAudioFromBase64 } from '../services/audioUtils';
import { generateSpeech } from '../services/contentGen';

interface PracticeSessionProps {
  exercises: PracticeExercise[];
  onComplete: () => void;
  onBack: () => void;
}

export const PracticeSession: React.FC<PracticeSessionProps> = ({ exercises, onComplete, onBack }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const currentExercise = exercises[currentIndex];
  const progress = ((currentIndex + 1) / exercises.length) * 100;

  const handleOptionClick = (option: string) => {
    if (selectedOption !== null) return;
    setSelectedOption(option);
    const correct = option === currentExercise.correctAnswer;
    setIsCorrect(correct);
    setShowExplanation(true);
  };

  const handleNext = () => {
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsCorrect(null);
      setShowExplanation(false);
    } else {
      onComplete();
    }
  };

  const playSentence = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      const base64 = await generateSpeech(currentExercise.sentence);
      if (base64) {
        await playAudioFromBase64(base64);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsPlaying(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 p-4 md:p-6 overflow-y-auto">
      {/* Header */}
      <div className="max-w-xl mx-auto w-full flex flex-col gap-6 pb-20">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-slate-500 hover:text-white transition-colors">取消</button>
          <div className="flex gap-1">
            {exercises.map((_, i) => (
              <div 
                key={i} 
                className={`h-1.5 w-8 rounded-full transition-all duration-500 ${
                  i < currentIndex ? 'bg-emerald-500' : (i === currentIndex ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-slate-800')
                }`} 
              />
            ))}
          </div>
          <span className="text-xs font-mono text-slate-500">{currentIndex + 1}/{exercises.length}</span>
        </div>

        {/* Exercise Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-center gap-2 mb-6">
            <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[10px] font-bold text-blue-400 uppercase tracking-widest">
              今日巩固练习
            </div>
            <div className="text-slate-600 text-xs flex items-center gap-1">
               <Info size={12} /> 根据语境选择正确单词
            </div>
          </div>

          <div className="mb-8">
            <h3 className="text-xl md:text-2xl font-medium text-slate-100 leading-relaxed mb-4">
              {currentExercise.quizQuestion}
            </h3>
            <p className="text-slate-500 text-sm italic">{currentExercise.sentenceZh}</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {currentExercise.options.map((option, idx) => {
              const isSelected = selectedOption === option;
              const isOptionCorrect = option === currentExercise.correctAnswer;
              
              let styles = "bg-slate-950/50 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700";
              if (selectedOption !== null) {
                if (isOptionCorrect) {
                  styles = "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]";
                } else if (isSelected) {
                  styles = "bg-red-500/20 border-red-500/50 text-red-400";
                } else {
                  styles = "bg-slate-950/30 border-slate-900 text-slate-600 opacity-50";
                }
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleOptionClick(option)}
                  disabled={selectedOption !== null}
                  className={`w-full p-4 rounded-2xl border-2 text-left font-medium transition-all duration-200 flex items-center justify-between ${styles}`}
                >
                  <span>{option}</span>
                  {selectedOption !== null && isOptionCorrect && <CheckCircle2 size={20} className="text-emerald-500" />}
                  {selectedOption !== null && !isOptionCorrect && isSelected && <XCircle size={20} className="text-red-500" />}
                </button>
              );
            })}
          </div>

          {showExplanation && (
            <div className="mt-8 p-5 bg-slate-950/50 border border-slate-800 rounded-2xl animate-in slide-in-from-top-4 duration-500">
               <div className="flex items-center justify-between mb-3">
                 <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase">
                    <Sparkles size={14} /> 解析与朗读
                 </div>
                 <button 
                  onClick={playSentence}
                  disabled={isPlaying}
                  className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 transition-colors"
                 >
                   {isPlaying ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
                 </button>
               </div>
               <p className="text-slate-300 text-sm leading-relaxed mb-4">
                 {currentExercise.explanation}
               </p>
               
               <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/50 text-xs text-slate-500 italic">
                 地道例句: "{currentExercise.sentence}"
               </div>

               <button
                onClick={handleNext}
                className="w-full mt-6 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                {currentIndex < exercises.length - 1 ? "下一题" : "查看总结"} <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
