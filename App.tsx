
import React, { useState, useEffect, useCallback } from 'react';
import { VocabularyItem, StudyItem, DailyStats, SessionResult, ConversationSession, PracticeExercise } from './types';
import { generateDailyContent, generateInitialTopic, generateTopicFromVocab, generatePracticeExercises } from './services/contentGen';
import { getTotalLocalItemsCount } from './services/localRepository';
import { StudySession } from './components/StudySession';
import { ConversationMode } from './components/ConversationMode';
import { ShadowingMode } from './components/ShadowingMode';
import { PracticeSession } from './components/PracticeSession';
import { SettingsModal } from './components/SettingsModal';
import { Mic, Book, Flame, GraduationCap, Settings, Shuffle, Repeat, Loader2 } from 'lucide-react';

type AppMode = 'dashboard' | 'study' | 'live' | 'shadowing' | 'exercise';

const CACHE_KEY = 'lingua_cached_exercises';

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

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('dashboard');
  const [showSettings, setShowSettings] = useState(false);
  const [vocabList, setVocabList] = useState<VocabularyItem[]>(() => {
    const saved = localStorage.getItem('lingua_vocab');
    return saved ? JSON.parse(saved) : [];
  });
  const [dailyStats, setDailyStats] = useState<DailyStats>(() => {
    const today = new Date().toDateString();
    const saved = localStorage.getItem('lingua_stats');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.date === today) return parsed;
    }
    return { date: today, itemsLearned: 0, completedSpeaking: false };
  });
  const [activeSession, setValues] = useState<ConversationSession | null>(null);
  const [todaysItems, setTodaysItems] = useState<StudyItem[]>([]);
  const [practiceExercises, setPracticeExercises] = useState<PracticeExercise[]>([]);
  const [currentPracticeItems, setCurrentPracticeItems] = useState<StudyItem[]>([]);
  const [studyIndex, setStudyIndex] = useState(0); 
  const [isGenerating, setIsGenerating] = useState<string | null>(null);

  useEffect(() => { localStorage.setItem('lingua_vocab', JSON.stringify(vocabList)); }, [vocabList]);
  useEffect(() => { localStorage.setItem('lingua_stats', JSON.stringify(dailyStats)); }, [dailyStats]);

  const overdueItems = vocabList.filter(v => v.nextReviewAt <= Date.now());

  /**
   * 核心逻辑提取：选择单词并调用 AI 生成练习题
   */
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

  /**
   * 预加载函数：在后台生成题目并存入缓存
   */
  const prefetchExercises = useCallback(async (currentVocab: VocabularyItem[], excludeItems: StudyItem[] = []) => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) return; 

    console.log("正在后台预加载下一轮练习题...");
    try {
        const result = await fetchNewExercises(currentVocab, excludeItems);
        if (result && result.exercises.length > 0) {
            localStorage.setItem(CACHE_KEY, JSON.stringify(result));
            console.log("后台预加载成功！");
        }
    } catch (e) {
        console.warn("后台预加载失败", e);
    }
  }, []);

  // Dashboard 加载时的自动预加载
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
    // 优先使用缓存
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
      
      // 如果没有需要复习的单词，随机从词库抽取3个新词
      if (!result || result.exercises.length === 0) {
        console.log("没有待复习单词，正在获取3个新词进行巩固...");
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
                     {overdueItems.length > 0 && (
                        <div className="absolute top-4 right-4 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg shadow-orange-500/30 animate-pulse">
                           {overdueItems.length}
                        </div>
                     )}
                     <div className="text-lg font-bold text-slate-100">每日巩固</div>
                  </button>
                  <button onClick={() => setMode('shadowing')} className="aspect-square text-left p-4 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col justify-between transition-transform active:scale-95">
                     <div className="p-3 w-fit rounded-2xl bg-purple-500/10 text-purple-400"><Repeat size={24} /></div>
                     <div className="text-lg font-bold text-slate-100">跟读挑战</div>
                  </button>
              </div>
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
