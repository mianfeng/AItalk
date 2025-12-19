
import React, { useState, useEffect } from 'react';
import { PracticeExercise } from '../types';
import { CheckCircle2, XCircle, ArrowRight, Volume2, Loader2, Trophy } from 'lucide-react';

interface PracticeSessionProps {
  exercises: PracticeExercise[];
  onComplete: (correctWords: string[]) => void;
  onBack: () => void;
}

export const PracticeSession: React.FC<PracticeSessionProps> = ({ exercises, onComplete, onBack }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<(string | null)[]>([]);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [correctResults, setCorrectResults] = useState<string[]>([]);
  const [isFinished, setIsFinished] = useState(false);

  const currentExercise = exercises[currentIndex];

  useEffect(() => {
    if (currentExercise) {
        setShuffledOptions([...currentExercise.options].sort(() => 0.5 - Math.random()));
        setUserAnswers(new Array(currentExercise.correctAnswers.length).fill(null)); 
        setIsCorrect(null);
        setShowExplanation(false);
    }
  }, [currentExercise]);

  const handleOptionClick = (word: string) => {
    if (isCorrect !== null) return; 
    const emptyIndex = userAnswers.indexOf(null);
    if (emptyIndex !== -1) {
        const newAnswers = [...userAnswers];
        newAnswers[emptyIndex] = word;
        setUserAnswers(newAnswers);
    }
  };

  const handleSlotClick = (index: number) => {
    if (isCorrect !== null) return;
    const newAnswers = [...userAnswers];
    newAnswers[index] = null;
    setUserAnswers(newAnswers);
  };

  const checkAnswer = () => {
    const correct = userAnswers.every((ans, i) => ans === currentExercise.correctAnswers[i]);
    setIsCorrect(correct);
    setShowExplanation(true);
    if (correct) setCorrectResults(prev => [...prev, ...currentExercise.correctAnswers]);
  };

  const handleNext = () => {
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsFinished(true);
    }
  };

  const playSentence = () => {
    if (isPlaying) return;
    setIsPlaying(true);
    const utterance = new SpeechSynthesisUtterance(currentExercise.sentence);
    utterance.lang = 'en-US';
    utterance.onend = () => setIsPlaying(false);
    window.speechSynthesis.speak(utterance);
  };

  const renderSentenceWithSlots = () => {
    const parts = currentExercise.quizQuestion.split('____');
    const elements = [];
    for (let i = 0; i < parts.length; i++) {
        elements.push(<span key={`text-${i}`} className="text-slate-300 font-medium text-lg leading-loose">{parts[i]}</span>);
        if (i < currentExercise.correctAnswers.length) { 
            const ans = userAnswers[i];
            const isWordCorrect = isCorrect !== null && ans === currentExercise.correctAnswers[i];
            elements.push(
                <button
                    key={`slot-${i}`}
                    onClick={() => handleSlotClick(i)}
                    className={`inline-flex items-center justify-center min-w-[90px] h-10 px-3 mx-1 align-middle rounded-xl border-b-4 transition-all ${
                        ans 
                        ? (isCorrect === null ? 'bg-blue-600 border-blue-800' : (isWordCorrect ? 'bg-emerald-600 border-emerald-800' : 'bg-red-500 border-red-800'))
                        : 'bg-slate-800 border-slate-700 animate-pulse'
                    } text-white font-bold`}
                >
                    {ans || "____"}
                </button>
            );
        }
    }
    return elements;
  };

  if (isFinished) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-950 p-6">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6"><Trophy size={40} className="text-emerald-500" /></div>
        <h2 className="text-2xl font-bold text-white mb-2">计划达成!</h2>
        <p className="text-slate-400 mb-8 text-center">你掌握了 {correctResults.length} 个目标词汇。</p>
        <button onClick={() => onComplete(correctResults)} className="w-full max-w-xs py-4 bg-emerald-600 text-white font-bold rounded-2xl transition-all">返回主页</button>
      </div>
    );
  }

  const allFilled = userAnswers.length > 0 && userAnswers.every(a => a !== null);

  return (
    <div className="h-full flex flex-col bg-slate-950 p-4 md:p-6 overflow-y-auto">
      <div className="max-w-xl mx-auto w-full flex flex-col gap-6 h-full pb-10">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-slate-500 text-sm font-medium">取消</button>
          <div className="flex-1 mx-8 h-1.5 bg-slate-900 rounded-full overflow-hidden">
             <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${((currentIndex + 1) / exercises.length) * 100}%` }}></div>
          </div>
          <span className="text-xs font-mono text-slate-500">{currentIndex + 1}/{exercises.length}</span>
        </div>

        <div className="flex-1 flex flex-col gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-2xl flex flex-col items-center justify-center min-h-[250px] relative">
                <div className="text-center mb-4">{renderSentenceWithSlots()}</div>
                <div className="px-4 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-slate-500 text-xs italic">{currentExercise.sentenceZh}</div>
                {showExplanation && (
                    <div className="absolute top-4 right-4">{isCorrect ? <CheckCircle2 size={32} className="text-emerald-500" /> : <XCircle size={32} className="text-red-500" />}</div>
                )}
            </div>

            {showExplanation ? (
                <div className="p-6 bg-slate-900 border border-indigo-500/30 rounded-2xl animate-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-indigo-400 uppercase">详解</span>
                        <button onClick={playSentence} className="text-indigo-300">
                           {isPlaying ? <Loader2 className="animate-spin" size={18} /> : <Volume2 size={18} />}
                        </button>
                    </div>
                    <p className="text-slate-400 text-sm mb-6">{currentExercise.explanation}</p>
                    <button onClick={handleNext} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-2">
                        {currentIndex < exercises.length - 1 ? "下一题" : "完成"} <ArrowRight size={18} />
                    </button>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-3 gap-3">
                        {shuffledOptions.map((option, idx) => {
                            const isUsed = userAnswers.includes(option);
                            return (
                                <button
                                    key={idx}
                                    onClick={() => handleOptionClick(option)}
                                    disabled={isUsed}
                                    className={`py-3 px-2 rounded-xl text-sm font-bold border-b-4 transition-all ${
                                        isUsed ? 'bg-slate-900 text-slate-700 border-slate-950 opacity-40' : 'bg-slate-800 text-slate-300 border-slate-950 hover:bg-slate-700'
                                    }`}
                                >
                                    {option}
                                </button>
                            );
                        })}
                    </div>
                    <button
                        onClick={checkAnswer}
                        disabled={!allFilled}
                        className={`w-full py-4 rounded-2xl font-bold text-white transition-all ${allFilled ? 'bg-blue-600 shadow-xl shadow-blue-900/20' : 'bg-slate-800 text-slate-600'}`}
                    >
                        {allFilled ? "确认提交" : "请填满所有空格"}
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
