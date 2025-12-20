
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
    setIsGenerating('exercise');
    try {
      let pool: StudyItem[] = [...overdueItems];
      // 如果到期词太少，补充一些新词凑够至少 3 个
      if (pool.length < 3) {
          const needed = 6 - pool.length; 
          const newItems = await generateDailyContent(needed, vocabList);
          pool = [...pool, ...newItems];
      }
      if (pool.length < 3) { alert("词库不足，无法生成练习。"); return; }
      
      // 记录当前参与练习的所有单词原形对象
      setCurrentPracticeItems(pool);
      
      // 随机排序并截取 3 的倍数（AI 是按 3 词一组造句的）
      const countToTake = pool.length - (pool.length % 3);
      const selected = pool.sort(() => 0.5 - Math.random()).slice(0, Math.min(countToTake, 45));
      
      const exercises = await generatePracticeExercises(selected);
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
    const updatedVocabList = [...vocabList];
    results.forEach(({ item, remembered }) => {
        const newLevel = remembered ? 1 : 0;
        // 只有新词才插入，避免重复
        if (!updatedVocabList.some(v => v.text === item.text)) {
           updatedVocabList.unshift({ ...item, addedAt: now, lastReviewed: now, nextReviewAt: now + getNextReviewInterval(newLevel), masteryLevel: newLevel, saved: true } as VocabularyItem);
        }
    });
    setVocabList(updatedVocabList);
    setDailyStats(prev => ({ ...prev, itemsLearned: prev.itemsLearned + results.length }));
    setMode('dashboard'); 
  };

  const handleExerciseComplete = (correctWordsBaseForms: string[]) => {
    const now = Date.now();
    setVocabList(prevList => {
        const newList = [...prevList];
        // 关键修复：从生成的题目中提取参与的所有单词原形
        const allTargetWords = new Set(practiceExercises.flatMap(ex => ex.targetWords));
        
        // 遍历词库，更新那些参与了本次练习的单词
        const updatedList = newList.map(item => {
            if (allTargetWords.has(item.text)) {
                const isCorrect = correctWordsBaseForms.includes(item.text);
                const currentLevel = item.masteryLevel || 0;
                // 正确则 Lv+1，错误则 Lv-1 (最低为1，新词变Lv1)
                const newLevel = isCorrect ? Math.min(5, currentLevel + 1) : Math.max(1, currentLevel - 1);
                
                return {
                    ...item,
                    lastReviewed: now,
                    nextReviewAt: now + getNextReviewInterval(newLevel),
                    masteryLevel: newLevel
                };
            }
            return item;
        });

        // 同时也处理那些不在词库中（属于临时抽取的“新词”）的情况
        // 这一步确保了即使是新词在练习中出现也会被加入词库
        allTargetWords.forEach(wordText => {
            if (!updatedList.some(v => v.text === wordText)) {
                const originalItem = currentPracticeItems.find(i => i.text === wordText);
                if (originalItem) {
                    const isCorrect = correctWordsBaseForms.includes(wordText);
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
