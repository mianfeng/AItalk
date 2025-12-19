
import React, { useState, useEffect } from 'react';
import { PracticeExercise } from '../types';
import { CheckCircle2, XCircle, ArrowRight, Volume2, Loader2, Trophy, Headphones } from 'lucide-react';
import { getPreferredVoice } from '../services/audioUtils';

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
  const [playingWord, setPlayingWord] = useState<string | null>(null);
  const [correctResults, setCorrectResults] = useState<string[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [preferredVoice, setPreferredVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const savedURI = localStorage.getItem('lingua_voice_uri');
      const bestVoice = getPreferredVoice(voices, savedURI);
      if (bestVoice) setPreferredVoice(bestVoice);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const currentExercise = exercises[currentIndex];

  useEffect(() => {
    if (currentExercise) {
        setShuffledOptions([...(currentExercise.options || [])].sort(() => 0.5 - Math.random()));
        setUserAnswers(new Array((currentExercise.correctAnswers || []).length).fill(null)); 
        setIsCorrect(null);
        setShowExplanation(false);
    }
  }, [currentExercise]);

  if (!exercises || exercises.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-950 p-6 text-slate-400">
        <p>暂无练习内容，请返回首页重新生成。</p>
        <button onClick={onBack} className="mt-4 px-6 py-2 bg-slate-800 rounded-full text-white">返回</button>
      </div>
    );
  }

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
    if (correct) {
      // Add all target words from this exercise to the session results
      setCorrectResults(prev => {
        const newSet = new Set([...prev, ...(currentExercise.correctAnswers || [])]);
        return Array.from(newSet);
      });
    }
  };

  const handleNext = () => {
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsFinished(true);
    }
  };

  const playTTS = (text: string, isFullSentence = false) => {
    if (!text) return;
    if (isFullSentence) {
      if (isPlaying) return;
      setIsPlaying(true);
    } else {
      setPlayingWord(text);
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    utterance.onend = () => {
      if (isFullSentence) setIsPlaying(false);
      else setPlayingWord(null);
    };
    utterance.onerror = () => {
      if (isFullSentence) setIsPlaying(false);
      else setPlayingWord(null);
    };
    window.speechSynthesis.speak(utterance);
  };

  const renderSentenceWithSlots = () => {
    if (!currentExercise || !currentExercise.quizQuestion) return null;
    const parts = currentExercise.quizQuestion.split('____');
    const elements = [];
    const correctAnsCount = (currentExercise.correctAnswers || []).length;

    for (let i = 0; i < parts.length; i++) {
        elements.push(<span key={`text-${i}`} className="text-slate-300 font-medium text-lg leading-loose">{parts[i]}</span>);
        if (i < correctAnsCount) { 
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
      <div className="h-full flex flex-col bg-slate-950 p-6 overflow-y-auto custom-scrollbar">
        <div className="max-w-xl mx-auto w-full flex flex-col items-center">
            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6 mt-10 shadow-lg shadow-emerald-500/10">
                <Trophy size={40} className="text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">计划达成!</h2>
            <p className="text-slate-400 mb-8 text-center text-sm">本次练习，你巩固了以下 {correctResults.length} 个单词：</p>
            
            <div className="w-full grid grid-cols-1 gap-3 mb-10">
                {correctResults.map((word, idx) => (
                    <div key={idx} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between group hover:border-emerald-500/30 transition-colors">
                        <span className="text-lg font-semibold text-slate-100">{word}</span>
                        <button 
                            onClick={() => playTTS(word)}
                            className={`p-2.5 rounded-full transition-all ${playingWord === word ? 'bg-emerald-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                        >
                            <Volume2 size={20} />
                        </button>
                    </div>
                ))}
            </div>

            <button 
                onClick={() => onComplete(correctResults)} 
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-emerald-900/20 mb-10 active:scale-95"
            >
                完成回顾
            </button>
        </div>
      </div>
    );
  }

  const allFilled = userAnswers.length > 0 && userAnswers.every(a => a !== null);

  return (
    <div className="h-full flex flex-col bg-slate-950 p-4 md:p-6 overflow-y-auto custom-scrollbar">
      <div className="max-w-xl mx-auto w-full flex flex-col gap-6 h-full pb-10">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-slate-500 text-sm font-medium hover:text-slate-300">取消</button>
          <div className="flex-1 mx-8 h-1.5 bg-slate-900 rounded-full overflow-hidden">
             <div className="h-full bg-blue-600 transition-all duration-500 shadow-sm" style={{ width: `${((currentIndex + 1) / exercises.length) * 100}%` }}></div>
          </div>
          <span className="text-xs font-mono text-slate-500">{currentIndex + 1}/{exercises.length}</span>
        </div>

        <div className="flex-1 flex flex-col gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent"></div>
                <div className="text-center mb-6">{renderSentenceWithSlots()}</div>
                <div className="px-5 py-2 bg-slate-950/80 rounded-2xl border border-slate-800/50 text-slate-400 text-sm leading-relaxed text-center">
                   {currentExercise?.sentenceZh}
                </div>
                {showExplanation && (
                    <div className="absolute top-6 right-6 animate-in zoom-in duration-300">
                        {isCorrect ? <CheckCircle2 size={36} className="text-emerald-500 drop-shadow-sm" /> : <XCircle size={36} className="text-red-500 drop-shadow-sm" />}
                    </div>
                )}
            </div>

            {showExplanation ? (
                <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4">
                    <div className="p-6 bg-slate-900 border border-indigo-500/20 rounded-3xl relative">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-4 bg-indigo-500 rounded-full"></span>
                                <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">详解回顾</span>
                            </div>
                            <button 
                                onClick={() => playTTS(currentExercise?.sentence, true)} 
                                className={`p-2 rounded-xl transition-all ${isPlaying ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-indigo-400 hover:bg-slate-700'}`}
                                title="播放完整句子"
                            >
                               {isPlaying ? <Loader2 className="animate-spin" size={18} /> : <Headphones size={18} />}
                            </button>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mb-4">
                            {currentExercise?.targetWords?.map((word, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => playTTS(word)}
                                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-2 transition-all ${
                                        playingWord === word 
                                        ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20' 
                                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                                    }`}
                                >
                                    {word} <Volume2 size={12} className={playingWord === word ? 'animate-pulse' : ''} />
                                </button>
                            ))}
                        </div>

                        <p className="text-slate-400 text-sm leading-relaxed mb-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/30">
                            {currentExercise?.explanation}
                        </p>
                        
                        <button 
                            onClick={handleNext} 
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-indigo-900/20 active:scale-95"
                        >
                            {currentIndex < exercises.length - 1 ? "下一题" : "查看总结"} <ArrowRight size={18} />
                        </button>
                    </div>
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
                                    className={`py-4 px-2 rounded-2xl text-sm font-bold border-b-4 transition-all active:translate-y-0.5 active:border-b-0 ${
                                        isUsed ? 'bg-slate-900 text-slate-700 border-slate-950 opacity-40' : 'bg-slate-800 text-slate-300 border-slate-950 hover:bg-slate-700 hover:text-white'
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
                        className={`w-full py-5 rounded-[1.5rem] font-bold text-white transition-all shadow-lg active:scale-95 ${allFilled ? 'bg-blue-600 shadow-blue-900/40 hover:bg-blue-500' : 'bg-slate-800 text-slate-600 cursor-not-allowed shadow-none'}`}
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
