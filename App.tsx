
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { VocabularyItem, StudyItem, DailyStats, SessionResult, ConversationSession, PracticeExercise, StatsHistory } from './types';
import { generateDailyContent, generateInitialTopic, generateTopicFromVocab, generatePracticeExercises } from './services/contentGen';
import { getTotalLocalItemsCount } from './services/localRepository';
import { StudySession } from './components/StudySession';
import { ConversationMode } from './components/ConversationMode';
import { ShadowingMode } from './components/ShadowingMode';
import { PracticeSession } from './components/PracticeSession';
import { SettingsModal } from './components/SettingsModal';
import { Mic, Book, Flame, GraduationCap, Settings, Shuffle, Repeat, Loader2, TrendingUp, Activity } from 'lucide-react';

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
  switch (level) {
    case 0: return ONE_DAY;
    case 1: return ONE_DAY;
    case 2: return 3 * ONE_DAY;
    case 3: return 7 * ONE_DAY;
    case 4: return 14 * ONE_DAY;
    case 5: return 30 * ONE_DAY;
    default: return ONE_DAY;
  }
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

    const maxVal = Math.max(...data.map(d => Math.max(d.itemsLearned, d.itemsReviewed, 5)));
    
    const getPoints = (key: 'itemsLearned' | 'itemsReviewed') => {
        return data.map((d, i) => {
            const x = (i / 6) * 100;
            const y = 100 - (d[key] / maxVal) * 80; // Leave 20% top padding
            return `${x},${y}`;
        }).join(' ');
    };

    return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 mt-4">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <div className="bg-emerald-500/10 p-1.5 rounded-lg"><Activity className="text-emerald-500" size={16} /></div>
                    <span className="text-sm font-bold text-slate-200">学习趋势</span>
                </div>
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        <span className="text-[10px] text-slate-500 font-medium">新词</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                        <span className="text-[10px] text-slate-500 font-medium">复习</span>
                    </div>
                </div>
            </div>
            
            <div className="h-24 w-full relative group">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                    {/* Grid lines */}
                    {[0, 25, 50, 75, 100].map(y => (
                        <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="white" strokeOpacity="0.03" strokeWidth="0.5" />
                    ))}
                    {/* Learned Line */}
                    <polyline fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={getPoints('itemsLearned')} className="drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
                    {/* Reviewed Line */}
                    <polyline fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={getPoints('itemsReviewed')} className="drop-shadow-[0_0_8px_rgba(249,115,22,0.3)]" />
                </svg>
            </div>
            
            <div className="flex justify-between mt-4">
                {last7Days.map((date, i) => (
                    <div key={date} className="flex flex-col items-center">
                        <span className="text-[8px] text-slate-600 font-mono uppercase">{i === 6 ? '今日' : date.split(' ')[1] + ' ' + date.split(' ')[2]}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('dashboard');
  const [showSettings, setShowSettings] = useState(false);
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
  }, [dailyStats]);

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
    
    const finalSelection = selected.slice(0, 45);
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
        const newItems = await generateDailyContent(15, vocabList); 
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
    <div className="flex flex-col h-[100dvh] bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <header className="h-16 shrink-0 border-b border-slate-900 bg-slate-950 flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setMode('dashboard')}>
           <div className="bg-emerald-500/10 p-2 rounded-lg"><GraduationCap className="text-emerald-500" size={20} /></div>
           <h1 className="font-bold text-slate-100 text-lg">LinguaFlow</h1>
        </div>
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-full border border-slate-800"><Flame size={14} className="text-orange-500 fill-orange-500" /><span className="text-xs font-mono">{vocabList.length}</span></div>
            <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-white"><Settings size={20} /></button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {mode === 'dashboard' && (
           <div className="h-full overflow-y-auto p-4 max-w-2xl mx-auto flex flex-col">
              <h2 className="text-2xl font-bold text-white mb-6">今日计划</h2>
              <div className="grid grid-cols-2 gap-3 mb-8">
                  <button onClick={startDailyPlan} disabled={!!isGenerating} className="aspect-square text-left p-4 rounded-3xl bg-slate-900 border border-slate-800 relative flex flex-col justify-between transition-transform active:scale-95">
                     <div className="p-3 w-fit rounded-2xl bg-slate-800 text-slate-400">
                        {isGenerating === 'study' ? <Loader2 className="animate-spin" size={24} /> : <Book size={24} />}
                     </div>
                     <div className="text-lg font-bold text-slate-100">新词学习</div>
                  </button>
                  <button onClick={initConversation} disabled={!!isGenerating} className="aspect-square text-left p-4 rounded-3xl bg-slate-900 border border-slate-800 relative flex flex-col justify-between transition-transform active:scale-95">
                     <div className="p-3 w-fit rounded-2xl bg-blue-500/10 text-blue-400">
                        {isGenerating === 'live' ? <Loader2 className="animate-spin" size={24} /> : <Mic size={24} />}
                     </div>
                     <div className="text-lg font-bold text-slate-100">情境对话</div>
                  </button>
                  <button onClick={startTodayPractice} disabled={!!isGenerating && !localStorage.getItem(CACHE_KEY)} className="aspect-square text-left p-4 rounded-3xl bg-slate-900 border border-slate-800 relative flex flex-col justify-between transition-transform active:scale-95">
                     <div className="p-3 w-fit rounded-2xl bg-orange-500/10 text-orange-400">
                        {isGenerating === 'exercise' && !localStorage.getItem(CACHE_KEY) ? <Loader2 className="animate-spin" size={24} /> : <Shuffle size={24} />}
                     </div>
                     <div className="absolute top-4 right-4">
                        {overdueItems.length > 0 ? (
                            <div className="bg-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-lg shadow-orange-500/30 animate-pulse">
                               待复习 {overdueItems.length}
                            </div>
                        ) : (
                            <div className="bg-slate-800 text-slate-500 text-[10px] font-medium px-2 py-1 rounded-lg border border-slate-700/50">
                               今日已完成
                            </div>
                        )}
                     </div>
                     <div className="text-lg font-bold text-slate-100">每日巩固</div>
                  </button>
                  <button onClick={() => setMode('shadowing')} className="aspect-square text-left p-4 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col justify-between transition-transform active:scale-95">
                     <div className="p-3 w-fit rounded-2xl bg-purple-500/10 text-purple-400"><Repeat size={24} /></div>
                     <div className="text-lg font-bold text-slate-100">跟读挑战</div>
                  </button>
              </div>

              <h2 className="text-2xl font-bold text-white mb-4">学习进度</h2>
              <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">今日新词</div>
                      <div className="text-2xl font-mono font-bold text-emerald-500">{dailyStats.itemsLearned}</div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">今日复习</div>
                      <div className="text-2xl font-mono font-bold text-orange-500">{dailyStats.itemsReviewed}</div>
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
      </main>
    </div>
  );
};
export default App;
