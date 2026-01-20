
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { VocabularyItem, StudyItem, DailyStats, SessionResult, ConversationSession, PracticeExercise, StatsHistory } from './types';
import { generateDailyContent, generateInitialTopic, generateTopicFromVocab, generatePracticeExercises, generateStudyItem } from './services/contentGen';
import { getTotalLocalItemsCount } from './services/localRepository';
import { StudySession } from './components/StudySession';
import { ConversationMode } from './components/ConversationMode';
import { ShadowingMode } from './components/ShadowingMode';
import { PracticeSession } from './components/PracticeSession';
import { SettingsModal } from './components/SettingsModal';
import { Mic, Book, Flame, GraduationCap, Settings, Shuffle, Repeat, Loader2, Activity, Zap, Sparkles, Plus, X, Search, PenTool, Check, ChevronRight, RotateCcw } from 'lucide-react';

type AppMode = 'dashboard' | 'study' | 'live' | 'shadowing' | 'exercise';

const CACHE_KEY = 'lingua_cached_exercises';
const STATS_HISTORY_KEY = 'lingua_stats_history';

const fastClean = (text: string) => {
    if (!text) return "";
    return text.trim().toLowerCase()
        .replace(/\s+[A-Z]\s+.*$/i, '') 
        .replace(/\s+[a-z]$/, '');
};

const getNextReviewInterval = (level: number): number => {
  const ONE_DAY = 24 * 60 * 60 * 1000;
  let days = 1;

  // Helper to get random integer between min and max (inclusive)
  const randomDays = (min: number, max: number) => {
      return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  switch (level) {
    case 0: 
    case 1: 
        days = 1; // 短期记忆关键期，固定1天
        break;
    case 2: 
        days = randomDays(2, 4); // 随机 2~4 天 (原固定3天)
        break;
    case 3: 
        days = randomDays(5, 9); // 随机 5~9 天 (原固定7天)
        break;
    case 4: 
        days = randomDays(11, 17); // 随机 11~17 天 (原固定14天)
        break;
    case 5: 
        days = 30; // 长效记忆，固定30天
        break;
    default: 
        days = 1;
  }
  
  return days * ONE_DAY;
};

const ActivityChart: React.FC<{ history: StatsHistory }> = ({ history }) => {
    const last7Days = useMemo(() => {
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toDateString());
        }
        return dates;
    }, []);

    const data = useMemo(() => {
        return last7Days.map(date => history[date] || { itemsLearned: 0, itemsReviewed: 0 });
    }, [history, last7Days]);

    const maxL = Math.max(...data.map(d => d.itemsLearned), 5);
    const maxR = Math.max(...data.map(d => d.itemsReviewed), 20);
    
    const padding = { top: 40, bottom: 30, left: 30, right: 30 };
    const chartWidth = 400 - padding.left - padding.right;
    const chartHeight = 160 - padding.top - padding.bottom;

    const getX = (index: number) => padding.left + (index / 6) * chartWidth;
    const getYL = (val: number) => padding.top + chartHeight - (val / maxL) * chartHeight;
    const getYR = (val: number) => padding.top + chartHeight - (val / maxR) * chartHeight;

    const learnedPoints = data.map((d, i) => `${getX(i)},${getYL(d.itemsLearned)}`).join(' ');
    const reviewedPoints = data.map((d, i) => `${getX(i)},${getYR(d.itemsReviewed)}`).join(' ');

    return (
        <div className="glass rounded-3xl p-5 mt-6 border border-white/5">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="bg-indigo-500/20 p-2 rounded-xl"><Activity className="text-indigo-400" size={18} /></div>
                    <span className="text-base font-bold text-slate-200">学习活动</span>
                </div>
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]"></div>
                        <span className="text-[10px] text-slate-400 font-medium">新词</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]"></div>
                        <span className="text-[10px] text-slate-400 font-medium">复习</span>
                    </div>
                </div>
            </div>
            
            <div className="w-full">
                <svg viewBox="0 0 400 160" className="w-full h-auto overflow-visible">
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map(v => {
                        const y = padding.top + v * chartHeight;
                        return <line key={v} x1={padding.left} y1={y} x2={400 - padding.right} y2={y} stroke="white" strokeOpacity="0.05" strokeWidth="1" strokeDasharray="4 4" />;
                    })}
                    
                    {/* Reviewed Line (Background) - Cyan */}
                    <defs>
                        <linearGradient id="gradCyan" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="rgba(34, 211, 238, 0.2)" />
                            <stop offset="100%" stopColor="rgba(34, 211, 238, 0)" />
                        </linearGradient>
                    </defs>
                    <polyline fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={reviewedPoints} className="drop-shadow-lg" />
                    
                    {/* Learned Line (Foreground) - Violet */}
                    <polyline fill="none" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={learnedPoints} className="drop-shadow-lg" />
                    
                    {/* Data Nodes & Labels */}
                    {data.map((d, i) => {
                        const x = getX(i);
                        const ly = getYL(d.itemsLearned);
                        const ry = getYR(d.itemsReviewed);
                        
                        return (
                            <g key={i}>
                                {/* Review Dot & Label */}
                                <circle cx={x} cy={ry} r="4" fill="#0f172a" stroke="#22d3ee" strokeWidth="2" />
                                <text x={x} y={ry - 12} fontSize="10" textAnchor="middle" fill="#22d3ee" fontWeight="bold" className="font-mono select-none">
                                    {d.itemsReviewed > 0 ? d.itemsReviewed : ''}
                                </text>
                                
                                {/* Learned Dot & Label */}
                                <circle cx={x} cy={ly} r="4" fill="#0f172a" stroke="#a78bfa" strokeWidth="2" />
                                <text x={x} y={ly + 20} fontSize="10" textAnchor="middle" fill="#a78bfa" fontWeight="bold" className="font-mono select-none">
                                    {d.itemsLearned > 0 ? d.itemsLearned : ''}
                                </text>
                            </g>
                        );
                    })}
                    
                    {/* X-Axis Dates */}
                    {last7Days.map((date, i) => (
                        <text key={date} x={getX(i)} y={160 - 5} fontSize="9" textAnchor="middle" fill="#64748b" fontWeight="600" className="font-mono uppercase">
                            {i === 6 ? '今日' : date.split(' ')[1] + ' ' + date.split(' ')[2]}
                        </text>
                    ))}
                </svg>
            </div>
        </div>
    );
};

const AddWordModal: React.FC<{
    show: boolean;
    onClose: () => void;
    onConfirm: (item: StudyItem) => void;
    existingVocab: VocabularyItem[];
}> = ({ show, onClose, onConfirm, existingVocab }) => {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [previewItem, setPreviewItem] = useState<StudyItem | null>(null);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (!show) {
            setInput('');
            setLoading(false);
            setPreviewItem(null);
        }
    }, [show]);

    const handleGenerate = async () => {
        if (!input.trim()) return;
        
        // Check duplicates
        const cleanedInput = fastClean(input);
        if (existingVocab.some(v => fastClean(v.text) === cleanedInput)) {
            alert("这个词已经在你的词库里了！");
            return;
        }

        setLoading(true);
        try {
            const item = await generateStudyItem(input);
            if (item) {
                setPreviewItem(item);
            } else {
                alert("生成失败，请重试");
            }
        } catch (e) {
            console.error(e);
            alert("网络错误");
        } finally {
            setLoading(false);
        }
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
            <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-[2rem] p-6 shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-10">
                    <X size={20} />
                </button>
                
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="bg-indigo-500/20 p-3 rounded-xl text-indigo-400">
                        {previewItem ? <Check size={24} /> : <Sparkles size={24} />}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{previewItem ? '确认录入' : '录入新词'}</h3>
                        <p className="text-xs text-slate-400">{previewItem ? '请确认生成的信息是否准确' : 'AI 将自动生成释义和例句'}</p>
                    </div>
                </div>

                {!previewItem ? (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4">
                        <textarea 
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="输入英语单词或短语..."
                            className="w-full h-32 bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 resize-none text-lg"
                            autoFocus
                        />
                        
                        <button 
                            onClick={handleGenerate}
                            disabled={!input.trim() || loading}
                            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20"
                        >
                            {loading ? <Loader2 className="animate-spin" size={20} /> : <Zap size={20} />}
                            {loading ? '正在生成...' : '生成预览'}
                        </button>
                        
                        <p className="text-[10px] text-center text-slate-500">
                            录入后将自动安排在<span className="text-indigo-400">明天</span>进行复习巩固
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4">
                        {/* Preview Card */}
                        <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 relative group">
                            <div className="flex items-baseline gap-2 mb-1">
                                <h2 className="text-2xl font-bold text-white">{previewItem.text}</h2>
                                {previewItem.pronunciation && <span className="text-sm font-mono text-slate-500">{previewItem.pronunciation}</span>}
                            </div>
                            <div className="text-emerald-400 font-medium mb-3">{previewItem.translation}</div>
                            
                            <div className="space-y-3 text-sm">
                                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                    <p className="text-slate-300 italic mb-1">"{previewItem.example}"</p>
                                    <p className="text-slate-500 text-xs">{previewItem.example_zh}</p>
                                </div>
                                <div className="text-xs text-slate-400 leading-relaxed pl-1">
                                    <span className="text-indigo-400 font-bold mr-1">DEF:</span>
                                    {previewItem.definition}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-2">
                             <button 
                                onClick={() => setPreviewItem(null)}
                                className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                <RotateCcw size={16} /> 返回修改
                            </button>
                            <button 
                                onClick={() => { onConfirm(previewItem); onClose(); }}
                                className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                            >
                                <Check size={18} /> 确认录入
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('dashboard');
  const [showSettings, setShowSettings] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const [vocabList, setVocabList] = useState<VocabularyItem[]>(() => {
    const saved = localStorage.getItem('lingua_vocab');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [statsHistory, setStatsHistory] = useState<StatsHistory>(() => {
      const saved = localStorage.getItem(STATS_HISTORY_KEY);
      return saved ? JSON.parse(saved) : {};
  });

  const todayStr = new Date().toDateString();

  const [dailyStats, setDailyStats] = useState<DailyStats>(() => {
    if (statsHistory[todayStr]) return statsHistory[todayStr];
    return { date: todayStr, itemsLearned: 0, itemsReviewed: 0, completedSpeaking: false };
  });

  useEffect(() => { localStorage.setItem('lingua_vocab', JSON.stringify(vocabList)); }, [vocabList]);
  
  useEffect(() => { 
      const updatedHistory = { ...statsHistory, [todayStr]: dailyStats };
      setStatsHistory(updatedHistory);
      localStorage.setItem(STATS_HISTORY_KEY, JSON.stringify(updatedHistory));
  }, [dailyStats, todayStr]);

  const overdueItems = vocabList.filter(v => v.nextReviewAt <= Date.now());

  const fetchNewExercises = async (currentVocab: VocabularyItem[], excludeItems: StudyItem[] = []) => {
    const excludeTexts = new Set(excludeItems.map(i => fastClean(i.text)));
    const filteredVocab = currentVocab.filter(v => !excludeTexts.has(fastClean(v.text)));
    
    const overdue = filteredVocab.filter(v => v.nextReviewAt <= Date.now());
    if (overdue.length === 0) return null;

    let selected: StudyItem[] = [...overdue];
    const remainder = selected.length % 3;
    if (remainder !== 0) {
        const needed = 3 - remainder;
        const learnedNotOverdue = filteredVocab.filter(v => v.nextReviewAt > Date.now());
        const fillers = learnedNotOverdue.sort(() => 0.5 - Math.random()).slice(0, needed);
        if (fillers.length < needed) {
            const newItems = await generateDailyContent(needed - fillers.length, currentVocab);
            selected = [...selected, ...fillers, ...newItems];
        } else {
            selected = [...selected, ...fillers];
        }
    }
    
    const finalSelection = selected.slice(0, 30);
    const exercises = await generatePracticeExercises(finalSelection);
    return { exercises, items: finalSelection };
  };

  const prefetchExercises = useCallback(async (currentVocab: VocabularyItem[], excludeItems: StudyItem[] = []) => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) return; 

    try {
        const result = await fetchNewExercises(currentVocab, excludeItems);
        if (result && result.exercises.length > 0) {
            localStorage.setItem(CACHE_KEY, JSON.stringify(result));
        }
    } catch (e) {
        console.warn("后台预加载失败", e);
    }
  }, []);

  useEffect(() => {
    if (mode === 'dashboard' && overdueItems.length > 0) {
        prefetchExercises(vocabList);
    }
  }, [mode, vocabList.length, prefetchExercises]);

  const startDailyPlan = async () => {
    setIsGenerating('study');
    try {
        const newItems = await generateDailyContent(10, vocabList); 
        if (newItems.length === 0) { alert("词库中的新词已学完！"); return; }
        setTodaysItems(newItems.map(i => ({ ...i, saved: false })));
        setStudyIndex(0); setMode('study');
    } catch (e) { alert("获取新词失败"); } finally { setIsGenerating(null); }
  };

  const startTodayPractice = async () => {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (cachedData) {
        try {
            const parsed = JSON.parse(cachedData);
            if (parsed.exercises && parsed.exercises.length > 0) {
                setPracticeExercises(parsed.exercises);
                setCurrentPracticeItems(parsed.items);
                setMode('exercise');
                localStorage.removeItem(CACHE_KEY);
                return;
            }
        } catch (e) {
            localStorage.removeItem(CACHE_KEY);
        }
    }

    setIsGenerating('exercise');
    try {
      let result = await fetchNewExercises(vocabList);
      if (!result || result.exercises.length === 0) {
        const newItems = await generateDailyContent(3, vocabList);
        if (newItems.length > 0) {
          const exercises = await generatePracticeExercises(newItems);
          result = { exercises, items: newItems };
        }
      }

      if (!result || result.exercises.length === 0) { 
        alert("目前词库已学完且没有待复习单词，去学习点新内容吧！");
        return; 
      }
      
      setPracticeExercises(result.exercises);
      setCurrentPracticeItems(result.items);
      setMode('exercise');
    } catch (e) { 
      alert("生成练习失败，请稍后重试。"); 
    } finally { 
      setIsGenerating(null); 
    }
  };

  const handleStudyComplete = (results: SessionResult[]) => {
    const now = Date.now();
    setVocabList(prev => {
        const newList = [...prev];
        results.forEach(({ item, remembered }) => {
            const newLevel = remembered ? 1 : 0;
            const cleanedText = fastClean(item.text);
            if (!newList.some(v => fastClean(v.text) === cleanedText)) {
               newList.unshift({ ...item, text: cleanedText, addedAt: now, lastReviewed: now, nextReviewAt: now + getNextReviewInterval(newLevel), masteryLevel: newLevel, saved: true } as VocabularyItem);
            }
        });
        return newList;
    });
    setDailyStats(prev => ({ ...prev, itemsLearned: prev.itemsLearned + results.length }));
    setMode('dashboard'); 
  };

  const handleExerciseComplete = (results: {word: string, isCorrect: boolean}[]) => {
    const now = Date.now();
    
    setVocabList(prevList => {
        const resultMap = new Map(results.map(r => [fastClean(r.word), r.isCorrect]));
        const updatedList = prevList.map(item => {
            const itemClean = fastClean(item.text);
            let isMatched = false;
            let isCorrect = false;

            for (const [resWord, correct] of resultMap.entries()) {
                if (resWord === itemClean || (itemClean.length > 3 && resWord.includes(itemClean)) || (resWord.length > 3 && itemClean.includes(resWord))) {
                    isMatched = true;
                    isCorrect = correct;
                    break;
                }
            }

            if (isMatched) {
                const currentLevel = item.masteryLevel || 0;
                const newLevel = isCorrect ? Math.min(5, currentLevel + 1) : Math.max(1, currentLevel - 1);
                return { ...item, text: itemClean, lastReviewed: now, nextReviewAt: now + getNextReviewInterval(newLevel), masteryLevel: newLevel };
            }
            return item;
        });

        results.forEach(({ word, isCorrect }) => {
            const wordClean = fastClean(word);
            if (!updatedList.some(v => fastClean(v.text) === wordClean)) {
                const originalItem = currentPracticeItems.find(i => fastClean(i.text) === wordClean);
                if (originalItem) {
                    const level = isCorrect ? 1 : 0;
                    updatedList.unshift({ ...originalItem, text: wordClean, addedAt: now, lastReviewed: now, nextReviewAt: now + getNextReviewInterval(level), masteryLevel: level, saved: true } as VocabularyItem);
                }
            }
        });
        return updatedList;
    });

    setDailyStats(prev => ({ ...prev, itemsReviewed: prev.itemsReviewed + results.length }));
    setMode('dashboard');
  };

  const handleSaveWord = (newItem: StudyItem) => {
      const now = Date.now();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0); // Start of next day
      const reviewTime = tomorrow.getTime();

      const vocabItem: VocabularyItem = {
          ...newItem,
          addedAt: now,
          lastReviewed: now,
          nextReviewAt: reviewTime, 
          masteryLevel: 0, // Treated as 'seen but not mastered'
          saved: true
      };

      setVocabList(prev => [vocabItem, ...prev]);
      setDailyStats(prev => ({ ...prev, itemsLearned: prev.itemsLearned + 1 }));
      localStorage.removeItem(CACHE_KEY); 
  };

  const initConversation = async () => {
      setIsGenerating('live');
      try {
          const poolWords = vocabList.slice(0, 3);
          const topic = poolWords.length > 0 ? await generateTopicFromVocab(poolWords) : await generateInitialTopic();
          setValues({ topic, targetWords: poolWords, history: [], lastUpdated: Date.now() });
          setMode('live');
      } catch (e) { alert("启动对话失败"); } finally { setIsGenerating(null); }
  };

  const [todaysItems, setTodaysItems] = useState<StudyItem[]>([]);
  const [practiceExercises, setPracticeExercises] = useState<PracticeExercise[]>([]);
  const [currentPracticeItems, setCurrentPracticeItems] = useState<StudyItem[]>([]);
  const [studyIndex, setStudyIndex] = useState(0); 
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [activeSession, setValues] = useState<ConversationSession | null>(null);

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden font-sans">
      {/* Glass Header */}
      <header className="h-16 shrink-0 border-b border-white/5 bg-black/20 backdrop-blur-md flex items-center justify-between px-4 z-20 absolute top-0 w-full">
        <div className="flex items-center gap-3">
           <button 
             onClick={() => setShowAddModal(true)} 
             className="relative bg-indigo-600/30 p-2 rounded-xl hover:bg-indigo-500/40 transition-all group active:scale-95"
           >
              <GraduationCap className="text-indigo-300 group-hover:text-indigo-200 transition-colors" size={20} />
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center border-[3px] border-[#0f172a] shadow-sm">
                  <Plus size={8} className="text-white" strokeWidth={4} />
              </div>
           </button>
           <h1 onClick={() => setMode('dashboard')} className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 to-purple-300 text-lg tracking-tight cursor-pointer">LinguaFlow</h1>
        </div>
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/5 hover:bg-white/10 transition-colors backdrop-blur-sm"><Flame size={14} className="text-amber-500 fill-amber-500" /><span className="text-xs font-mono font-bold text-slate-300">{vocabList.length}</span></div>
            <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-white transition-colors hover:bg-white/5 rounded-full"><Settings size={20} /></button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative pt-16">
        {mode === 'dashboard' && (
           <div className="h-full overflow-y-auto p-4 max-w-2xl mx-auto flex flex-col animate-in fade-in duration-500">
              <h2 className="text-2xl font-bold text-white mb-6 mt-2 flex items-center gap-2">
                  <Sparkles className="text-yellow-400" size={20} /> 今日计划
              </h2>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                  {/* Card 1: Study */}
                  <button onClick={startDailyPlan} disabled={!!isGenerating} className="aspect-square text-left p-5 rounded-[2rem] bg-gradient-to-br from-violet-900/60 to-slate-900/80 border border-violet-500/20 relative flex flex-col justify-between transition-all hover:scale-[1.02] active:scale-95 hover:shadow-[0_0_20px_rgba(139,92,246,0.2)] group overflow-hidden">
                     <div className="absolute inset-0 bg-violet-600/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                     <div className="p-3 w-fit rounded-2xl bg-violet-500/20 text-violet-300 border border-violet-500/30 group-hover:bg-violet-500 group-hover:text-white transition-colors">
                        {isGenerating === 'study' ? <Loader2 className="animate-spin" size={24} /> : <Book size={24} />}
                     </div>
                     <div>
                        <div className="text-xs text-violet-300/70 font-medium mb-1 uppercase tracking-wider">Words</div>
                        <div className="text-lg font-bold text-white group-hover:text-violet-100">新词学习</div>
                     </div>
                  </button>

                  {/* Card 2: Conversation */}
                  <button onClick={initConversation} disabled={!!isGenerating} className="aspect-square text-left p-5 rounded-[2rem] bg-gradient-to-br from-cyan-900/60 to-slate-900/80 border border-cyan-500/20 relative flex flex-col justify-between transition-all hover:scale-[1.02] active:scale-95 hover:shadow-[0_0_20px_rgba(6,182,212,0.2)] group overflow-hidden">
                     <div className="absolute inset-0 bg-cyan-600/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                     <div className="p-3 w-fit rounded-2xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 group-hover:bg-cyan-500 group-hover:text-white transition-colors">
                        {isGenerating === 'live' ? <Loader2 className="animate-spin" size={24} /> : <Mic size={24} />}
                     </div>
                     <div>
                        <div className="text-xs text-cyan-300/70 font-medium mb-1 uppercase tracking-wider">Talk</div>
                        <div className="text-lg font-bold text-white group-hover:text-cyan-100">情境对话</div>
                     </div>
                  </button>

                  {/* Card 3: Practice */}
                  <button onClick={startTodayPractice} disabled={!!isGenerating && !localStorage.getItem(CACHE_KEY)} className="aspect-square text-left p-5 rounded-[2rem] bg-gradient-to-br from-amber-900/60 to-slate-900/80 border border-amber-500/20 relative flex flex-col justify-between transition-all hover:scale-[1.02] active:scale-95 hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] group overflow-hidden">
                     <div className="absolute inset-0 bg-amber-600/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                     <div className="p-3 w-fit rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/30 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                        {isGenerating === 'exercise' && !localStorage.getItem(CACHE_KEY) ? <Loader2 className="animate-spin" size={24} /> : <Shuffle size={24} />}
                     </div>
                     <div className="absolute top-5 right-5">
                        {overdueItems.length > 0 ? (
                            <div className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg animate-pulse">
                               {overdueItems.length}
                            </div>
                        ) : (
                            <div className="w-2 h-2 rounded-full bg-slate-700" />
                        )}
                     </div>
                     <div>
                        <div className="text-xs text-amber-300/70 font-medium mb-1 uppercase tracking-wider">Review</div>
                        <div className="text-lg font-bold text-white group-hover:text-amber-100">每日巩固</div>
                     </div>
                  </button>

                  {/* Card 4: Shadowing */}
                  <button onClick={() => setMode('shadowing')} className="aspect-square text-left p-5 rounded-[2rem] bg-gradient-to-br from-pink-900/60 to-slate-900/80 border border-pink-500/20 relative flex flex-col justify-between transition-all hover:scale-[1.02] active:scale-95 hover:shadow-[0_0_20px_rgba(236,72,153,0.2)] group overflow-hidden">
                     <div className="absolute inset-0 bg-pink-600/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                     <div className="p-3 w-fit rounded-2xl bg-pink-500/20 text-pink-300 border border-pink-500/30 group-hover:bg-pink-500 group-hover:text-white transition-colors">
                        <Repeat size={24} />
                     </div>
                     <div>
                        <div className="text-xs text-pink-300/70 font-medium mb-1 uppercase tracking-wider">Mimic</div>
                        <div className="text-lg font-bold text-white group-hover:text-pink-100">跟读挑战</div>
                     </div>
                  </button>
              </div>

              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
                  <Zap className="text-cyan-400" size={20} /> 学习进度
              </h2>
              <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="glass-card p-4 rounded-2xl">
                      <div className="text-[10px] font-bold text-violet-300/70 uppercase tracking-widest mb-1">今日新词</div>
                      <div className="text-3xl font-mono font-bold text-violet-400">{dailyStats.itemsLearned}</div>
                  </div>
                  <div className="glass-card p-4 rounded-2xl">
                      <div className="text-[10px] font-bold text-cyan-300/70 uppercase tracking-widest mb-1">今日复习</div>
                      <div className="text-3xl font-mono font-bold text-cyan-400">{dailyStats.itemsReviewed}</div>
                  </div>
              </div>
              <ActivityChart history={statsHistory} />
              <div className="h-10 shrink-0" />
           </div>
        )}

        {mode === 'study' && <StudySession items={todaysItems} initialIndex={studyIndex} onProgress={setStudyIndex} onComplete={handleStudyComplete} onBack={() => setMode('dashboard')} />}
        {mode === 'exercise' && (
            <PracticeSession 
                exercises={practiceExercises} 
                onBack={() => setMode('dashboard')} 
                onComplete={handleExerciseComplete} 
                onSecondQuestionReached={() => prefetchExercises(vocabList, currentPracticeItems)}
            />
        )}
        {mode === 'live' && <ConversationMode session={activeSession!} onUpdate={setValues} onEndSession={() => setMode('dashboard')} onBack={() => setMode('dashboard')} onSaveVocab={() => {}} />}
        {mode === 'shadowing' && <ShadowingMode onBack={() => setMode('dashboard')} />}

        <SettingsModal show={showSettings} onClose={() => setShowSettings(false)} vocabList={vocabList} dailyStats={dailyStats} onRestore={d => { setVocabList(d.vocabList); localStorage.removeItem(CACHE_KEY); }} totalRepoCount={getTotalLocalItemsCount()} />
        <AddWordModal show={showAddModal} onClose={() => setShowAddModal(false)} onConfirm={handleSaveWord} existingVocab={vocabList} />
      </main>
    </div>
  );
};
export default App;
