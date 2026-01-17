
import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { PracticeExercise, VocabularyItem } from '../types';
import { CheckCircle2, XCircle, ArrowRight, Volume2, Loader2, Trophy, Headphones, BarChart, Gauge, Sparkles, X, Mic, Square, RotateCcw, Repeat } from 'lucide-react';
import { sanitizeForTTS } from '../services/audioUtils';
import { useSpeech } from '../hooks/useSpeech';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { evaluatePronunciation, evaluateSentencePronunciation, PronunciationResult, SentencePronunciationResult } from '../services/contentGen';

interface PracticeSessionProps {
  exercises: PracticeExercise[];
  onComplete: (results: {word: string, isCorrect: boolean}[]) => void;
  onBack: () => void;
  onSecondQuestionReached?: () => void; 
}

// 环绕进度边框组件
const CardProgressBorder: React.FC<{ progress: number; children: React.ReactNode }> = ({ progress, children }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useLayoutEffect(() => {
        if (!containerRef.current) return;
        
        const updateDimensions = () => {
            if (containerRef.current) {
                const { offsetWidth, offsetHeight } = containerRef.current;
                setDimensions({ width: offsetWidth, height: offsetHeight });
            }
        };

        // Initial measurement
        updateDimensions();

        const observer = new ResizeObserver(() => {
            updateDimensions();
        });

        observer.observe(containerRef.current);

        return () => observer.disconnect();
    }, []);

    // Config for the border
    const strokeWidth = 4;
    const radius = 32; // Matches rounded-[2rem] (approx 32px)
    const w = dimensions.width;
    const h = dimensions.height;
    
    // Calculate path length for a rounded rectangle
    const perimeter = 2 * (w - 2 * radius) + 2 * (h - 2 * radius) + (2 * Math.PI * radius);
    
    // Ensure perimeter is positive
    const totalLength = perimeter > 0 ? perimeter : 0;
    
    // Calculate offset
    const dashOffset = totalLength - (progress * totalLength);

    return (
        <div className="relative w-full" ref={containerRef}>
            {/* The actual content card */}
            <div className="relative z-10 w-full">
                {children}
            </div>

            {/* SVG Overlay for Border */}
            <svg 
                className="absolute inset-0 pointer-events-none w-full h-full z-20 overflow-visible"
                width={w} 
                height={h}
            >
                <defs>
                    <linearGradient id="practiceProgressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f59e0b" /> {/* amber-500 */}
                        <stop offset="100%" stopColor="#ea580c" /> {/* orange-600 */}
                    </linearGradient>
                    <filter id="practiceGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                </defs>
                
                {/* Background Track - Centered on edge (x=0, y=0, w=w, h=h) */}
                <rect
                    x={0}
                    y={0}
                    width={w}
                    height={h}
                    rx={radius}
                    ry={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth={strokeWidth}
                />

                {/* Progress Path */}
                {totalLength > 0 && (
                    <rect
                        x={0}
                        y={0}
                        width={w}
                        height={h}
                        rx={radius}
                        ry={radius}
                        fill="none"
                        stroke="url(#practiceProgressGradient)"
                        strokeWidth={strokeWidth}
                        strokeDasharray={totalLength}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                        className="transition-all duration-700 ease-out"
                        filter="url(#practiceGlow)"
                    />
                )}
            </svg>
        </div>
    );
};

// Word Practice Modal Component
const WordPracticeModal: React.FC<{
    word: string;
    onClose: () => void;
}> = ({ word, onClose }) => {
    const [status, setStatus] = useState<'idle' | 'recording' | 'processing' | 'result'>('idle');
    const [result, setResult] = useState<PronunciationResult | null>(null);
    const { startRecording, stopRecording } = useAudioRecorder();
    const { speak } = useSpeech();

    const handleToggleRecord = async () => {
        if (status === 'idle' || status === 'result') {
            setStatus('recording');
            startRecording();
        } else if (status === 'recording') {
            setStatus('processing');
            try {
                const audio = await stopRecording();
                const evalResult = await evaluatePronunciation(audio, word);
                setResult(evalResult);
                setStatus('result');
            } catch (e) {
                console.error(e);
                alert("录音失败");
                setStatus('idle');
            }
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 w-full max-w-xs rounded-3xl p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20} /></button>
                
                <div className="flex flex-col items-center gap-4">
                    <h3 className="text-2xl font-bold text-white">{word}</h3>
                    <button onClick={() => speak(word)} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-indigo-400"><Volume2 size={20} /></button>
                    
                    {status === 'result' && result && (
                        <div className="flex flex-col items-center gap-2 mb-2">
                             <div className={`text-4xl font-bold ${result.score >= 80 ? 'text-emerald-400' : (result.score >= 60 ? 'text-amber-400' : 'text-rose-400')}`}>
                                 {result.score}
                             </div>
                             <p className="text-xs text-slate-400 text-center">{result.feedback}</p>
                             {result.breakdown && (
                                <div className="flex gap-1 mt-2">
                                    {result.breakdown.map((b, i) => (
                                        <div key={i} className="flex flex-col items-center">
                                            <div className="w-1.5 h-8 bg-slate-800 rounded-full overflow-hidden relative">
                                                <div className={`absolute bottom-0 w-full ${b.score >= 80 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{height: `${b.score}%`}} />
                                            </div>
                                            <span className="text-[8px] text-slate-500 mt-1">{b.label}</span>
                                        </div>
                                    ))}
                                </div>
                             )}
                        </div>
                    )}

                    <button 
                        onClick={handleToggleRecord}
                        className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${status === 'recording' ? 'bg-rose-500 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                    >
                        {status === 'recording' ? <Square size={24} fill="currentColor" className="text-white" /> : 
                        (status === 'processing' ? <Loader2 size={24} className="animate-spin text-white" /> : <Mic size={24} className="text-white" />)}
                    </button>
                    <p className="text-xs text-slate-500">{status === 'recording' ? '点击停止' : '点击跟读'}</p>
                </div>
            </div>
        </div>
    );
};

export const PracticeSession: React.FC<PracticeSessionProps> = ({ exercises, onComplete, onBack, onSecondQuestionReached }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<(string | null)[]>([]);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [playingWord, setPlayingWord] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  
  // Sentence Practice State
  const [isRecordingSentence, setIsRecordingSentence] = useState(false);
  const [isProcessingSentence, setIsProcessingSentence] = useState(false);
  const [sentenceEval, setSentenceEval] = useState<SentencePronunciationResult | null>(null);
  const [practiceWord, setPracticeWord] = useState<string | null>(null); // To trigger modal

  const [speechRate, setSpeechRate] = useState<number>(() => {
    const saved = localStorage.getItem('lingua_practice_rate');
    return saved ? parseFloat(saved) : 1.0;
  });

  const { speak, isPlaying } = useSpeech();
  const { startRecording, stopRecording } = useAudioRecorder();

  const triggeredPrefetchRef = useRef(false);
  const [sessionResults, setSessionResults] = useState<Map<string, boolean>>(new Map());
  const [isFinished, setIsFinished] = useState(false);

  const vocabMap = useMemo(() => {
    const saved = localStorage.getItem('lingua_vocab');
    if (!saved) return new Map<string, {level: number, pronunciation: string}>();
    const list: VocabularyItem[] = JSON.parse(saved);
    return new Map(list.map(v => [v.text.toLowerCase(), { level: v.masteryLevel, pronunciation: v.pronunciation || "" }]));
  }, [isFinished, showExplanation]);

  const currentExercise = exercises[currentIndex];

  useEffect(() => {
    if (currentExercise) {
        const extraOptions = currentExercise.targetWords || [];
        const baseOptions = [...(currentExercise.options || [])];
        const allOptions = Array.from(new Set([...baseOptions, ...extraOptions]));

        setShuffledOptions(allOptions.sort(() => 0.5 - Math.random()));
        setUserAnswers(new Array((currentExercise.correctAnswers || []).length).fill(null)); 
        setIsCorrect(null);
        setShowExplanation(false);
        setIsFlipped(false);
        setSentenceEval(null); // Reset sentence eval
    }
    
    if (currentIndex === 1 && !triggeredPrefetchRef.current && onSecondQuestionReached) {
        onSecondQuestionReached();
        triggeredPrefetchRef.current = true;
    }
  }, [currentIndex, currentExercise, onSecondQuestionReached]);

  const normalize = (str: string | null) => {
    if (!str) return "";
    return str.toLowerCase().trim()
        .replace(/[\u2018\u2019\u201B\u2032\u2035]/g, "'")
        .replace(/[\u201C\u201D\u201F\u2033\u2036]/g, '"')
        .replace(/[.,!?;:]/g, ''); 
  };

  const isAnswerCorrect = (userAns: string | null, index: number) => {
      if (!userAns) return false;
      const normUser = normalize(userAns);
      const normCorrect = normalize(currentExercise.correctAnswers[index]);
      
      const normTarget = currentExercise.targetWords && currentExercise.targetWords[index] 
          ? normalize(currentExercise.targetWords[index]) 
          : '';
      
      return normUser === normCorrect || (!!normTarget && normUser === normTarget);
  };

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
    const overallCorrect = userAnswers.every((ans, i) => isAnswerCorrect(ans, i));
    
    setIsCorrect(overallCorrect);
    setShowExplanation(true);
    
    setSessionResults(prev => {
        const next = new Map(prev);
        currentExercise.targetWords.forEach((word, i) => {
            const isThisSlotCorrect = isAnswerCorrect(userAnswers[i], i);
            next.set(word, isThisSlotCorrect);
        });
        return next;
    });
  };

  const handleNext = () => {
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsFinished(true);
    }
  };

  const toggleSpeed = () => {
    const rates = [1.0, 0.8, 0.6];
    const nextRate = rates[(rates.indexOf(speechRate) + 1) % rates.length];
    setSpeechRate(nextRate);
    localStorage.setItem('lingua_practice_rate', nextRate.toString());
  };

  const playTTS = (text: string, isFullSentence = false) => {
    if (!text) return;
    if (!isFullSentence) setPlayingWord(text);
    
    speak(
        text, 
        isFullSentence ? speechRate : 1.0, 
        () => setPlayingWord(null) 
    );
  };

  const handleToggleSentenceRecording = async () => {
    if (isProcessingSentence) return;
    
    if (isRecordingSentence) {
        setIsRecordingSentence(false);
        setIsProcessingSentence(true);
        try {
            const audio = await stopRecording();
            const result = await evaluateSentencePronunciation(audio, currentExercise.sentence);
            setSentenceEval(result);
        } catch (e) {
            console.error(e);
            alert("评分失败");
        } finally {
            setIsProcessingSentence(false);
        }
    } else {
        setSentenceEval(null);
        setIsRecordingSentence(true);
        startRecording();
    }
  };

  // Helper to color words based on sentence evaluation
  const getWordColorClass = (word: string, index: number) => {
      if (!sentenceEval || !sentenceEval.words) return 'text-slate-200';
      const evalWord = sentenceEval.words[index];
      if (evalWord) {
          if (evalWord.score >= 80) return 'text-emerald-400';
          if (evalWord.score < 70) return 'text-amber-400';
      }
      return 'text-slate-200';
  };

  const renderSentenceWithSlots = () => {
    if (!currentExercise || !currentExercise.quizQuestion) return null;
    const parts = currentExercise.quizQuestion.split('____');
    const elements = [];
    const correctAnsCount = (currentExercise.correctAnswers || []).length;
    for (let i = 0; i < parts.length; i++) {
        elements.push(<span key={`text-${i}`} className="text-slate-200 font-medium text-lg leading-loose">{parts[i]}</span>);
        if (i < correctAnsCount) { 
            const ans = userAnswers[i];
            const isWordCorrect = isCorrect !== null && isAnswerCorrect(ans, i);
            
            let slotStyle = "bg-white/10 border-white/20 text-slate-300"; 
            if (ans) {
               if (isCorrect === null) slotStyle = "bg-amber-500/20 border-amber-500 text-amber-200";
               else if (isWordCorrect) slotStyle = "bg-emerald-500/20 border-emerald-500 text-emerald-300";
               else slotStyle = "bg-rose-500/20 border-rose-500 text-rose-300";
            } else {
               slotStyle = "bg-slate-800 border-dashed border-slate-600 animate-pulse";
            }

            elements.push(
                <button key={`slot-${i}`} onClick={() => handleSlotClick(i)} className={`inline-flex items-center justify-center min-w-[80px] h-9 px-3 mx-1.5 align-middle rounded-lg border-b-2 transition-all ${slotStyle} font-bold text-base shadow-sm`}>
                    {ans || ""}
                </button>
            );
        }
    }
    return elements;
  };

  if (isFinished) {
    const finalResultsArray = Array.from(sessionResults.entries()).map(([word, isCorrect]) => ({ word, isCorrect }));
    const correctCount = finalResultsArray.filter(r => r.isCorrect).length;

    return (
      <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar">
        <div className="max-w-xl mx-auto w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-4">
            <div className="w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mb-6 mt-10 shadow-[0_0_30px_rgba(245,158,11,0.3)]">
                <Trophy size={48} className="text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">计划达成!</h2>
            <p className="text-slate-400 mb-8 text-center text-sm">正确率 {correctCount} / {finalResultsArray.length}</p>
            
            <div className="w-full grid grid-cols-1 gap-3 mb-10">
                {finalResultsArray.map((res, idx) => {
                    const stats = vocabMap.get(res.word.toLowerCase()) || { level: 0, pronunciation: "" };
                    return (
                        <div key={idx} className={`glass-card p-4 rounded-2xl flex items-center justify-between group transition-colors border ${res.isCorrect ? 'border-emerald-500/20' : 'border-rose-500/20'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md border shrink-0 ${res.isCorrect ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                                    <BarChart size={10} />
                                    <span className="text-[10px] font-bold uppercase">Lv {stats.level}</span>
                                </div>
                                <div className="flex items-baseline gap-2 overflow-hidden">
                                    <span className={`text-lg font-semibold truncate ${res.isCorrect ? 'text-slate-100' : 'text-slate-400'}`}>{res.word}</span>
                                </div>
                                {!res.isCorrect && <span className="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded shrink-0 border border-rose-500/10">需巩固</span>}
                            </div>
                            <button onClick={() => playTTS(res.word)} className={`p-2.5 rounded-full transition-all shrink-0 ${playingWord === res.word ? 'bg-amber-500 text-white animate-pulse' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}>
                                <Volume2 size={20} />
                            </button>
                        </div>
                    );
                })}
            </div>
            <button onClick={() => onComplete(finalResultsArray)} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-emerald-900/20 mb-10 active:scale-95">
                完成回顾
            </button>
        </div>
      </div>
    );
  }

  const allFilled = userAnswers.length > 0 && userAnswers.every(a => a !== null);
  
  // Calculate progress for the border (0 to 1)
  const progressValue = (currentIndex + 1) / exercises.length;

  return (
    <div className="h-full flex flex-col p-4 md:p-6 overflow-y-auto custom-scrollbar">
      {practiceWord && (
          <WordPracticeModal word={practiceWord} onClose={() => setPracticeWord(null)} />
      )}
      
      <div className="max-w-xl mx-auto w-full flex flex-col gap-6 h-full pb-10">
        
        {/* Header - Minimalist */}
        <div className="flex items-center justify-between px-2">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
             <X size={20} />
          </button>
          <div className="flex flex-col items-end">
             <span className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-0.5">Daily Review</span>
             <span className="text-sm font-mono font-medium text-slate-300">
               <span className="text-amber-400 text-lg">{currentIndex + 1}</span>
               <span className="text-slate-600 mx-1">/</span>
               {exercises.length}
             </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-6">
            
            {/* Main Card with Progress Border & Flip - Grid layout for auto sizing */}
            <div className="perspective-1000 w-full relative">
                <CardProgressBorder progress={progressValue}>
                    <div className={`w-full transition-transform duration-500 transform-style-3d grid grid-cols-1 ${isFlipped ? 'rotate-y-180' : ''}`}>
                        
                        {/* Front Side: Fill-in-the-blank */}
                        <div 
                            className="col-start-1 row-start-1 backface-hidden glass rounded-[2rem] p-8 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden bg-slate-900/40 backdrop-blur-xl min-h-[300px]"
                            onClick={() => showExplanation && setIsFlipped(true)}
                            style={{ transform: "rotateY(0deg)" }}
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500/10 to-transparent"></div>
                            <div className="text-center mb-8 relative z-10 w-full">{renderSentenceWithSlots()}</div>
                            <div className="px-5 py-2 bg-black/20 rounded-xl border border-white/5 text-slate-400 text-sm leading-relaxed text-center backdrop-blur-sm max-w-full">
                            {currentExercise?.sentenceZh}
                            </div>
                            
                            {showExplanation && (
                                <>
                                    <div className="absolute top-6 right-6 animate-in zoom-in duration-300 drop-shadow-lg">
                                        {isCorrect ? <CheckCircle2 size={40} className="text-emerald-500" /> : <XCircle size={40} className="text-rose-500" />}
                                    </div>
                                    <div className="absolute bottom-4 flex items-center gap-1.5 text-xs text-indigo-400 font-medium animate-pulse cursor-pointer">
                                        <Repeat size={12} />
                                        <span>点击翻转跟读</span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Back Side: Shadowing Practice */}
                        <div 
                            className="col-start-1 row-start-1 backface-hidden rotate-y-180 bg-slate-900 rounded-[2rem] p-6 shadow-2xl flex flex-col relative overflow-hidden border border-white/10 min-h-[300px]"
                            style={{ transform: "rotateY(180deg)" }}
                        >
                             <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
                             
                             <div className="flex justify-between items-center w-full mb-6 relative z-10">
                                <div className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold flex items-center gap-2">
                                    <Mic size={12} /> Oral Practice
                                </div>
                                <button onClick={() => setIsFlipped(false)} className="p-2 -mr-2 text-slate-500 hover:text-white transition-colors">
                                    <RotateCcw size={16} />
                                </button>
                             </div>
                             
                             <div className="flex-1 flex flex-col justify-center items-center gap-8 relative z-10 w-full">
                                <div className="flex flex-wrap gap-x-1.5 gap-y-3 justify-center content-center text-center">
                                    {currentExercise.sentence.split(' ').map((word, i) => (
                                        <span 
                                            key={i} 
                                            onClick={(e) => { e.stopPropagation(); setPracticeWord(word.replace(/[^a-zA-Z]/g, '')); }}
                                            className={`text-xl md:text-2xl font-medium cursor-pointer hover:underline decoration-white/20 transition-all active:scale-95 ${getWordColorClass(word, i)}`}
                                        >
                                            {word}
                                        </span>
                                    ))}
                                </div>

                                <div className="flex flex-col items-center gap-4 w-full mt-auto">
                                    <div className="flex items-center gap-6">
                                        {sentenceEval && (
                                            <div className="flex flex-col items-center animate-in zoom-in">
                                                <div className={`text-2xl font-bold ${sentenceEval.score >= 80 ? 'text-emerald-400' : (sentenceEval.score < 70 ? 'text-amber-400' : 'text-slate-200')}`}>{sentenceEval.score}</div>
                                                <div className="text-[8px] text-slate-600 uppercase tracking-wider">Score</div>
                                            </div>
                                        )}

                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleToggleSentenceRecording(); }}
                                            disabled={isProcessingSentence}
                                            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg ${
                                                isProcessingSentence ? 'bg-slate-800 text-slate-500' : 
                                                (isRecordingSentence ? 'bg-rose-500 animate-pulse text-white shadow-rose-500/30' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-500/30 hover:scale-105 active:scale-95')
                                            }`}
                                        >
                                            {isProcessingSentence ? <Loader2 size={24} className="animate-spin" /> : 
                                            (isRecordingSentence ? <Square size={20} fill="currentColor" /> : <Mic size={28} />)}
                                        </button>
                                        
                                        <button onClick={(e) => { e.stopPropagation(); playTTS(currentExercise?.sentence, true); }} className={`p-3 rounded-full transition-all ${isPlaying ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
                                            {isPlaying ? <Loader2 className="animate-spin" size={18} /> : <Headphones size={18} />}
                                        </button>
                                    </div>
                                    
                                    {sentenceEval ? (
                                         <div className="text-xs text-slate-400 text-center bg-black/20 px-3 py-2 rounded-lg max-w-[90%] border border-white/5 animate-in slide-in-from-bottom-2">
                                            {sentenceEval.feedback}
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-slate-600 animate-pulse">点击单词可单独练习</p>
                                    )}
                                </div>
                             </div>
                        </div>

                    </div>
                </CardProgressBorder>
            </div>

            {showExplanation ? (
                <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4">
                    <div className="p-6 bg-slate-900/80 backdrop-blur-md border border-indigo-500/20 rounded-3xl relative">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Sparkles size={16} className="text-indigo-400" />
                                <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">详解回顾</span>
                            </div>
                            <button 
                                onClick={toggleSpeed}
                                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-[10px] font-mono font-bold text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
                                title="调整语速"
                            >
                                <Gauge size={12} /> {speechRate.toFixed(1)}x
                            </button>
                        </div>
                        
                        {/* Word Cards Grid */}
                        <div className="grid grid-cols-3 gap-2 mb-6">
                            {currentExercise?.targetWords?.map((word, idx) => {
                                const stats = vocabMap.get(word.toLowerCase()) || { level: 0, pronunciation: "" };
                                const pronunciation = currentExercise.targetWordPronunciations?.[idx] || stats.pronunciation;
                                
                                return (
                                    <button key={idx} onClick={() => playTTS(word)} className={`px-3 py-3 rounded-xl border text-xs font-medium flex flex-col items-center justify-center transition-all ${playingWord === word ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg' : 'bg-black/20 border-white/5 text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
                                        <div className="flex items-center justify-between w-full mb-1 opacity-70">
                                            <div className="flex items-center gap-1 scale-90 origin-left">
                                                <BarChart size={10} />
                                                <span className="text-[9px] font-bold">Lv{stats.level}</span>
                                            </div>
                                            <Volume2 size={10} className={playingWord === word ? 'animate-pulse' : ''} />
                                        </div>
                                        <div className="flex items-baseline gap-1.5 max-w-full overflow-hidden">
                                            <span className="truncate font-bold text-sm">{word}</span>
                                            {pronunciation && <span className={`text-[9px] font-mono italic shrink-0 ${playingWord === word ? 'text-emerald-100' : 'text-slate-600'}`}>{pronunciation}</span>}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <p className="text-slate-400 text-sm leading-relaxed mb-6 bg-black/20 p-4 rounded-2xl border border-white/5 font-light">
                            {currentExercise?.explanation}
                        </p>
                        
                        <button onClick={handleNext} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-indigo-900/30 active:scale-95">
                            {currentIndex < exercises.length - 1 ? "下一题" : "查看总结"} <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {shuffledOptions.map((option, idx) => {
                            const isUsed = userAnswers.includes(option);
                            return (
                                <button key={idx} onClick={() => handleOptionClick(option)} disabled={isUsed} className={`py-4 px-2 rounded-2xl text-sm font-bold border-b-4 transition-all active:translate-y-0.5 active:border-b-0 ${isUsed ? 'bg-slate-800/50 text-slate-600 border-slate-900 opacity-50' : 'bg-slate-800 text-slate-300 border-slate-950 hover:bg-slate-700 hover:text-white hover:border-slate-800 shadow-lg'}`}>
                                    {option}
                                </button>
                            );
                        })}
                    </div>
                    <button onClick={checkAnswer} disabled={!allFilled} className={`w-full py-4 rounded-2xl font-bold text-white transition-all shadow-xl active:scale-95 ${allFilled ? 'bg-gradient-to-r from-amber-500 to-orange-600 shadow-orange-900/20' : 'bg-slate-800 text-slate-600 cursor-not-allowed shadow-none'}`}>
                        {allFilled ? "确认提交" : "请填满所有空格"}
                    </button>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
