
import React, { useState, useEffect } from 'react';
import { PracticeExercise } from '../types';
import { CheckCircle2, XCircle, ArrowRight, Sparkles, Volume2, Loader2, Trophy, Zap, Play, X, RefreshCw } from 'lucide-react';
import { getPreferredVoice } from '../services/audioUtils';

interface PracticeSessionProps {
  exercises: PracticeExercise[];
  onComplete: (correctWords: string[]) => void;
  onBack: () => void;
}

export const PracticeSession: React.FC<PracticeSessionProps> = ({ exercises, onComplete, onBack }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // State for multi-blank interaction
  const [userAnswers, setUserAnswers] = useState<(string | null)[]>([]);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingWord, setPlayingWord] = useState<string | null>(null);
  
  // Accumulate all correct words across the session
  const [correctResults, setCorrectResults] = useState<string[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  
  const [preferredVoice, setPreferredVoice] = useState<SpeechSynthesisVoice | null>(null);

  const currentExercise = exercises[currentIndex];

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

  // Initialize options and answers when exercise changes
  useEffect(() => {
    if (currentExercise) {
        setShuffledOptions([...currentExercise.options].sort(() => 0.5 - Math.random()));
        // Initialize based on the actual number of correct answers (usually 3)
        setUserAnswers(new Array(currentExercise.correctAnswers.length).fill(null)); 
        setIsCorrect(null);
        setShowExplanation(false);
    }
  }, [currentExercise]);

  const handleOptionClick = (word: string) => {
    if (isCorrect !== null) return; // Locked if already submitted/checked

    // Find first empty slot
    const emptyIndex = userAnswers.indexOf(null);
    if (emptyIndex !== -1) {
        const newAnswers = [...userAnswers];
        newAnswers[emptyIndex] = word;
        setUserAnswers(newAnswers);
    }
  };

  const handleSlotClick = (index: number) => {
    if (isCorrect !== null) return; // Locked
    const newAnswers = [...userAnswers];
    newAnswers[index] = null;
    setUserAnswers(newAnswers);
  };

  const checkAnswer = () => {
    const isFull = userAnswers.every(a => a !== null);
    if (!isFull) return;

    // Compare userAnswers with correctAnswers
    // Assuming strict order
    const correct = userAnswers.every((ans, i) => ans === currentExercise.correctAnswers[i]);
    
    setIsCorrect(correct);
    setShowExplanation(true);
    
    if (correct) {
        // If correct, add ALL target words to the results
        setCorrectResults(prev => [...prev, ...currentExercise.correctAnswers]);
    }
  };

  const handleNext = () => {
    window.speechSynthesis.cancel();
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex(prev => prev + 1);
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
    // Use the full correct sentence for TTS
    const utterance = new SpeechSynthesisUtterance(currentExercise.sentence);
    utterance.lang = 'en-US';
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    window.speechSynthesis.speak(utterance);
  };

  // Render the sentence with interactive slots
  const renderSentenceWithSlots = () => {
    const parts = currentExercise.quizQuestion.split('____');
    // We expect parts to be correctAnswers.length + 1 generally
    
    const elements = [];
    for (let i = 0; i < parts.length; i++) {
        elements.push(<span key={`text-${i}`} className="text-slate-300 font-medium leading-loose text-lg">{parts[i]}</span>);
        // Insert slot if we are not at the last text part AND we have a corresponding answer slot
        if (i < parts.length - 1 && i < currentExercise.correctAnswers.length) { 
            const ans = userAnswers[i];
            const isCorrectSlot = isCorrect !== null && ans === currentExercise.correctAnswers[i];
            const isWrongSlot = isCorrect !== null && ans !== currentExercise.correctAnswers[i];
            
            elements.push(
                <button
                    key={`slot-${i}`}
                    onClick={() => handleSlotClick(i)}
                    className={`inline-flex items-center justify-center min-w-[80px] h-10 px-3 mx-1 align-middle rounded-xl border-b-4 transition-all ${
                        ans 
                        ? (isCorrect === null 
                            ? 'bg-blue-600 text-white border-blue-800' 
                            : (isCorrectSlot ? 'bg-emerald-600 text-white border-emerald-800' : 'bg-red-500 text-white border-red-800'))
                        : 'bg-slate-800 border-slate-700 animate-pulse'
                    }`}
                >
                    {ans || <span className="opacity-20 text-xl">?</span>}
                </button>
            );
        }
    }
    return elements;
  };

  if (isFinished) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-950 p-6">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6 animate-bounce">
          <Trophy size={40} className="text-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">计划达成!</h2>
        <p className="text-slate-400 mb-8 text-center leading-relaxed">
            表现出色！你掌握了 {correctResults.length} / {exercises.length * 3} 个目标词汇。<br/>
            熟练度已同步更新。
        </p>
        <button onClick={() => onComplete(correctResults)} className="w-full max-w-xs py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-2xl shadow-xl transition-all">返回主页</button>
      </div>
    );
  }

  // Check if answers are fully initialized and filled
  const allFilled = userAnswers.length > 0 && userAnswers.every(a => a !== null);

  return (
    <div className="h-full flex flex-col bg-slate-950 p-4 md:p-6 overflow-y-auto custom-scrollbar">
      <div className="max-w-xl mx-auto w-full flex flex-col gap-4 pb-20 h-full">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <button onClick={onBack} className="text-slate-500 hover:text-white transition-colors text-sm font-medium">取消</button>
          <div className="flex-1 mx-8 h-1.5 bg-slate-900 rounded-full overflow-hidden">
             <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-500 ease-out" style={{ width: `${((currentIndex + 1) / exercises.length) * 100}%` }}></div>
          </div>
          <span className="text-xs font-mono text-slate-500">{currentIndex + 1}/{exercises.length}</span>
        </div>

        {/* Card */}
        <div className="flex-1 flex flex-col relative">
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden flex flex-col min-h-[300px]">
                
                {/* Sentence Area */}
                <div className="mb-6 flex-1 flex flex-col justify-center">
                    <div className="mb-4 leading-relaxed text-center">
                        {renderSentenceWithSlots()}
                    </div>
                    <div className="text-center">
                        <div className="inline-block px-4 py-1.5 bg-slate-950/60 rounded-xl border border-slate-800/50 text-slate-500 text-xs italic">
                            {currentExercise.sentenceZh}
                        </div>
                    </div>
                </div>

                {/* Status Icon */}
                {showExplanation && (
                    <div className="absolute top-4 right-4 animate-in zoom-in spin-in-180 duration-500">
                        {isCorrect ? <CheckCircle2 size={32} className="text-emerald-500" /> : <XCircle size={32} className="text-red-500" />}
                    </div>
                )}
            </div>

            {/* Explanation Panel (Overlay or Bottom) */}
            {showExplanation && (
                <div className="mt-4 p-5 bg-slate-900/90 border border-indigo-500/30 rounded-2xl animate-in slide-in-from-bottom-4 fade-in duration-300">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-indigo-400 uppercase">正确答案</span>
                        <button onClick={playSentence} className="text-indigo-300 hover:text-white"><Volume2 size={18} /></button>
                    </div>
                    <p className="text-indigo-100 font-medium mb-2">{currentExercise.sentence}</p>
                    <p className="text-slate-400 text-xs">{currentExercise.explanation}</p>
                    <button
                        onClick={handleNext}
                        className="w-full mt-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        {currentIndex < exercises.length - 1 ? "下一题" : "完成"} <ArrowRight size={18} />
                    </button>
                </div>
            )}

            {/* Options Area (Only show if not explaining) */}
            {!showExplanation && (
                <div className="mt-auto pt-6">
                    <div className="grid grid-cols-3 gap-3">
                        {shuffledOptions.map((option, idx) => {
                            // Check if this option is already used in userAnswers
                            const isUsed = userAnswers.includes(option);
                            return (
                                <button
                                    key={idx}
                                    onClick={() => handleOptionClick(option)}
                                    disabled={isUsed}
                                    className={`py-3 px-2 rounded-xl text-sm font-bold border-b-4 transition-all active:scale-95 ${
                                        isUsed 
                                        ? 'bg-slate-900 text-slate-700 border-slate-800 scale-95 opacity-50' 
                                        : 'bg-slate-800 text-slate-300 border-slate-950 hover:bg-slate-700 hover:text-white hover:border-slate-900'
                                    }`}
                                >
                                    {option}
                                </button>
                            );
                        })}
                    </div>
                    
                    {/* Check Button */}
                    <div className="mt-6 flex justify-center">
                        <button
                            onClick={checkAnswer}
                            disabled={!allFilled}
                            className={`w-full py-4 rounded-2xl font-bold text-white shadow-xl transition-all flex items-center justify-center gap-2 ${
                                allFilled 
                                ? 'bg-blue-600 hover:bg-blue-500 active:scale-95 hover:shadow-blue-500/20' 
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            }`}
                        >
                            {allFilled ? <><CheckCircle2 size={20} /> 提交答案</> : "请填满空格"}
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
