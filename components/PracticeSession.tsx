
import React, { useState, useEffect } from 'react';
import { PracticeExercise } from '../types';
import { CheckCircle2, XCircle, ArrowRight, Sparkles, Volume2, Loader2, Trophy, Zap, Play } from 'lucide-react';
import { getPreferredVoice } from '../services/audioUtils';

interface PracticeSessionProps {
  exercises: PracticeExercise[];
  onComplete: (correctWords: string[]) => void;
  onBack: () => void;
}

export const PracticeSession: React.FC<PracticeSessionProps> = ({ exercises, onComplete, onBack }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingWord, setPlayingWord] = useState<string | null>(null);
  const [correctResults, setCorrectResults] = useState<string[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  
  const [preferredVoice, setPreferredVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const best = getPreferredVoice(voices, localStorage.getItem('lingua_voice_uri'));
      if (best) setPreferredVoice(best);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const currentExercise = exercises[currentIndex];

  // Robust Text Highlighter with Regex Escaping to prevent crashes
  const renderHighlightedText = (text: string, targets: string[]) => {
    if (!text) return null;
    
    // 1. Escape targets to prevent regex injection/crashes
    const escapedTargets = targets.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const sortedTargets = [...escapedTargets].sort((a, b) => b.length - a.length);
    
    // 2. Build safe regex pattern
    // Matching "____" or any of the target words (case-insensitive)
    const pattern = new RegExp(`(${sortedTargets.join('|')}|_{4,})`, 'gi');
    const parts = text.split(pattern);

    return parts.map((part, i) => {
      if (!part) return null;
      if (part.includes('____')) {
          return <span key={i} className="px-2 py-0.5 mx-1 rounded bg-slate-800 border border-slate-700 text-blue-400 font-bold shadow-inner">____</span>;
      }
      // Compare original part with original targets (un-escaped)
      if (targets.some(t => t.toLowerCase() === part.toLowerCase())) {
        return <span key={i} className="text-blue-400 font-bold decoration-blue-500/30 underline-offset-4">{part}</span>;
      }
      return part;
    });
  };

  const handleOptionClick = (option: string) => {
    if (selectedOption !== null) return;
    setSelectedOption(option);
    const correct = option === currentExercise.correctAnswer;
    setIsCorrect(correct);
    setShowExplanation(true);
    if (correct) setCorrectResults(prev => [...prev, currentExercise.word]);
  };

  const handleNext = () => {
    window.speechSynthesis.cancel(); // Stop any pending speech
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsCorrect(null);
      setShowExplanation(false);
    } else {
      setIsFinished(true);
    }
  };

  const playLocalWord = (word: string) => {
    setPlayingWord(word);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'en-US';
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.onend = () => setPlayingWord(null);
    utterance.onerror = () => setPlayingWord(null);
    window.speechSynthesis.speak(utterance);
  };

  const playSentence = () => {
    if (isPlaying) return;
    setIsPlaying(true);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentExercise.sentence);
    utterance.lang = 'en-US';
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    window.speechSynthesis.speak(utterance);
  };

  if (isFinished) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-950 p-6">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <Trophy size={40} className="text-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">计划达成!</h2>
        <p className="text-slate-400 mb-8 text-center leading-relaxed">
            表现出色！你答对了 {correctResults.length} / {exercises.length} 道题。<br/>
            掌握程度已同步更新。
        </p>
        <button onClick={() => onComplete(correctResults)} className="w-full max-w-xs py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-2xl shadow-xl transition-all">返回主页</button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 p-4 md:p-6 overflow-y-auto custom-scrollbar">
      <div className="max-w-xl mx-auto w-full flex flex-col gap-6 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-slate-500 hover:text-white transition-colors text-sm font-medium">取消</button>
          <div className="flex-1 mx-8 h-1.5 bg-slate-900 rounded-full overflow-hidden">
             <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-500 ease-out" style={{ width: `${((currentIndex + 1) / exercises.length) * 100}%` }}></div>
          </div>
          <span className="text-xs font-mono text-slate-500">{currentIndex + 1}/{exercises.length}</span>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 md:p-8 shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <div className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[10px] font-bold text-blue-400 uppercase tracking-widest">三词语境巩固</div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-950/80 rounded-lg border border-slate-800 text-[10px] font-bold text-slate-500">
                <Zap size={10} className="text-amber-500" /> 本地发音
            </div>
          </div>

          <div className="mb-10 text-center">
            <h3 className="text-lg md:text-xl font-medium text-slate-100 leading-relaxed mb-4 min-h-[4rem] flex flex-wrap justify-center items-center gap-x-1">
              {renderHighlightedText(currentExercise.quizQuestion, currentExercise.targetWords)}
            </h3>
            <div className="inline-block px-4 py-1.5 bg-slate-950/40 rounded-full border border-slate-800/50">
               <p className="text-slate-500 text-xs italic">{currentExercise.sentenceZh}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 mb-2">
            {currentExercise.options.map((option, idx) => {
              const isSelected = selectedOption === option;
              const isOptionCorrect = option === currentExercise.correctAnswer;
              
              let styles = "bg-slate-950/40 border-slate-800/60 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700 active:scale-[0.98]";
              if (selectedOption !== null) {
                if (isOptionCorrect) styles = "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)] scale-[1.02]";
                else if (isSelected) styles = "bg-red-500/20 border-red-500/50 text-red-400";
                else styles = "bg-slate-950/20 border-slate-900 text-slate-600 opacity-40 grayscale-[0.5]";
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleOptionClick(option)}
                  disabled={selectedOption !== null}
                  className={`w-full p-4.5 rounded-[1.25rem] border-2 text-left font-semibold transition-all duration-300 flex items-center justify-between ${styles}`}
                >
                  <span className="text-base">{option}</span>
                  {selectedOption !== null && isOptionCorrect && <CheckCircle2 size={22} className="text-emerald-500 animate-in zoom-in duration-300" />}
                  {selectedOption !== null && !isOptionCorrect && isSelected && <XCircle size={22} className="text-red-500 animate-in zoom-in duration-300" />}
                </button>
              );
            })}
          </div>

          {showExplanation && (
            <div className="mt-8 p-6 bg-slate-950/60 backdrop-blur-md border border-slate-800/50 rounded-[1.5rem] animate-in slide-in-from-top-4 fade-in duration-500">
               <div className="flex items-center justify-between mb-5">
                 <div className="flex items-center gap-2 text-blue-400 text-[10px] font-black uppercase tracking-tighter bg-blue-500/10 px-2 py-0.5 rounded">
                    <Sparkles size={12} /> 知识解析
                 </div>
                 <button 
                  onClick={playSentence}
                  disabled={isPlaying}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 rounded-xl text-slate-300 transition-all active:scale-95"
                 >
                   {isPlaying ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
                   <span className="text-[10px] font-bold">听句子</span>
                 </button>
               </div>

               <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-slate-900/50">
                  {currentExercise.targetWords.map((word, i) => (
                    <button 
                      key={i}
                      onClick={() => playLocalWord(word)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                        playingWord === word ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Play size={10} fill={playingWord === word ? "white" : "currentColor"} />
                      {word}
                    </button>
                  ))}
               </div>
               
               <p className="text-slate-300 text-sm leading-[1.8] font-medium whitespace-pre-line">
                 {currentExercise.explanation}
               </p>
               
               <button
                onClick={handleNext}
                className="w-full mt-8 py-4.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                {currentIndex < exercises.length - 1 ? "继续下一题" : "完成本次挑战"} <ArrowRight size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
