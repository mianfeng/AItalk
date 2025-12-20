
import React, { useState, useEffect } from 'react';
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
    if (overdueItems.length === 0) {
        alert("目前没有需要复习的单词，去学习点新内容吧！");
        return;
    }

    setIsGenerating('exercise');
    try {
      let selected: StudyItem[] = [...overdueItems];
      const remainder = selected.length % 3;
      if (remainder !== 0) {
          const needed = 3 - remainder;
          const learnedNotOverdue = vocabList.filter(v => v.nextReviewAt > Date.now());
          const fillers = learnedNotOverdue.sort(() => 0.5 - Math.random()).slice(0, needed);
          if (fillers.length < needed) {
              const newItems = await generateDailyContent(needed - fillers.length, vocabList);
              selected = [...selected, ...fillers, ...newItems];
          } else {
              selected = [...selected, ...fillers];
          }
      }
      
      const finalSelection = selected.slice(0, 45);
      setCurrentPracticeItems(finalSelection);
      const exercises = await generatePracticeExercises(finalSelection);
      
      if (exercises.length === 0) { throw new Error("AI failed to return exercises"); }
      
      setPracticeExercises(exercises);
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
            if (!newList.some(v => v.text.trim().toLowerCase() === item.text.trim().toLowerCase())) {
               newList.unshift({ ...item, addedAt: now, lastReviewed: now, nextReviewAt: now + getNextReviewInterval(newLevel), masteryLevel: newLevel, saved: true } as VocabularyItem);
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
        const newList = [...prevList];
        // 将传入的结果转化为 Map 方便快速查找，Key 全部 trim 且小写化
        const resultMap = new Map(results.map(r => [r.word.trim().toLowerCase(), r.isCorrect]));
        
        // 1. 更新词库中已有的词
        const updatedList = newList.map(item => {
            const itemTextClean = item.text.trim().toLowerCase();
            if (resultMap.has(itemTextClean)) {
                const isCorrect = resultMap.get(itemTextClean);
                const currentLevel = item.masteryLevel || 0;
                // 正确 Lv+1，错误 Lv-1
                const newLevel = isCorrect ? Math.min(5, currentLevel + 1) : Math.max(1, currentLevel - 1);
                
                // 彻底刷新复习时间，将其从红点中移除
                return {
                    ...item,
                    lastReviewed: now,
                    nextReviewAt: now + getNextReviewInterval(newLevel),
                    masteryLevel: newLevel
                };
            }
            return item;
        });

        // 2. 如果练习中有新加入的词（陪跑词），也顺便存入词库
        results.forEach(({ word, isCorrect }) => {
            const wordClean = word.trim().toLowerCase();
            if (!updatedList.some(v => v.text.trim().toLowerCase() === wordClean)) {
                const originalItem = currentPracticeItems.find(i => i.text.trim().toLowerCase() === wordClean);
                if (originalItem) {
                    const level = isCorrect ? 1 : 0;
                    updatedList.unshift({
                        ...originalItem,
                        addedAt: now,
                        lastReviewed: now,
                        nextReviewAt: now + getNextReviewInterval(level),
                        masteryLevel: level,
                        saved: true
                    } as VocabularyItem);
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
                  <button onClick={startDailyPlan} disabled={!!isGenerating} className="aspect-square text-left p-4 rounded-3xl bg-slate-900 border border-slate-800 relative flex flex-col justify-between overflow-hidden transition-transform active:scale-95">
                     <div className="p-3 w-fit rounded-2xl bg-slate-800 text-slate-400">
                        {isGenerating === 'study' ? <Loader2 className="animate-spin" size={24} /> : <Book size={24} />}
                     </div>
                     {dailyStats.itemsLearned > 0 && (
                        <div className="absolute top-4 right-4 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg shadow-emerald-500/20">
                           今日 +{dailyStats.itemsLearned}
                        </div>
                     )}
                     <div className="text-lg font-bold text-slate-100">新词学习</div>
                  </button>
                  <button onClick={initConversation} disabled={!!isGenerating} className="aspect-square text-left p-4 rounded-3xl bg-slate-900 border border-slate-800 relative flex flex-col justify-between transition-transform active:scale-95">
                     <div className="p-3 w-fit rounded-2xl bg-blue-500/10 text-blue-400">
                        {isGenerating === 'live' ? <Loader2 className="animate-spin" size={24} /> : <Mic size={24} />}
                     </div>
                     <div className="text-lg font-bold text-slate-100">情境对话</div>
                  </button>
                  <button onClick={startTodayPractice} disabled={!!isGenerating} className="aspect-square text-left p-4 rounded-3xl bg-slate-900 border border-slate-800 relative flex flex-col justify-between transition-transform active:scale-95">
                     <div className="p-3 w-fit rounded-2xl bg-orange-500/10 text-orange-400">
                        {isGenerating === 'exercise' ? <Loader2 className="animate-spin" size={24} /> : <Shuffle size={24} />}
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
        {mode === 'exercise' && <PracticeSession exercises={practiceExercises} onBack={() => setMode('dashboard')} onComplete={handleExerciseComplete} />}
        {mode === 'live' && <ConversationMode session={activeSession!} onUpdate={setValues} onEndSession={() => setMode('dashboard')} onBack={() => setMode('dashboard')} onSaveVocab={() => {}} />}
        {mode === 'shadowing' && <ShadowingMode onBack={() => setMode('dashboard')} />}

        <SettingsModal show={showSettings} onClose={() => setShowSettings(false)} vocabList={vocabList} dailyStats={dailyStats} onRestore={d => setVocabList(d.vocabList)} totalRepoCount={getTotalLocalItemsCount()} />
      </main>
    </div>
  );
};
export default App;
