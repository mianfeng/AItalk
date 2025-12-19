
import React, { useState, useEffect } from 'react';
import { VocabularyItem, StudyItem, DailyStats, BackupData, ItemType, SessionResult, ConversationSession, PracticeExercise } from './types';
import { generateDailyContent, generateInitialTopic, generateTopicFromVocab, generatePracticeExercises } from './services/contentGen';
import { getTotalLocalItemsCount } from './services/localRepository';
import { StudySession } from './components/StudySession';
import { ConversationMode } from './components/ConversationMode';
import { ShadowingMode } from './components/ShadowingMode';
import { PracticeSession } from './components/PracticeSession';
import { ReviewList } from './components/ReviewList';
import { SettingsModal } from './components/SettingsModal';
import { Mic, Book, CheckCircle, Flame, GraduationCap, RefreshCw, Play, X, History, Settings, AlertTriangle, ArrowRight, Loader2, BarChart2, Bell, Shuffle, MessageCircle, Repeat, Target, Sparkles } from 'lucide-react';

type AppMode = 'dashboard' | 'study' | 'live' | 'review' | 'shadowing' | 'exercise';

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
  const [activeSession, setActiveSession] = useState<ConversationSession | null>(() => {
      const saved = localStorage.getItem('lingua_conversation');
      return saved ? JSON.parse(saved) : null;
  });
  const [todaysItems, setTodaysItems] = useState<StudyItem[]>([]);
  const [practiceExercises, setPracticeExercises] = useState<PracticeExercise[]>([]);
  // Stores the original StudyItem objects for the current practice session to allow saving new words
  const [currentPracticeItems, setCurrentPracticeItems] = useState<StudyItem[]>([]);
  
  const [studyIndex, setStudyIndex] = useState(0); 
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => { localStorage.setItem('lingua_vocab', JSON.stringify(vocabList)); }, [vocabList]);
  useEffect(() => { localStorage.setItem('lingua_stats', JSON.stringify(dailyStats)); }, [dailyStats]);
  useEffect(() => { 
    if (activeSession) localStorage.setItem('lingua_conversation', JSON.stringify(activeSession));
    else localStorage.removeItem('lingua_conversation');
  }, [activeSession]);

  const overdueItems = vocabList.filter(v => v.nextReviewAt <= Date.now());
  const learnedToday = vocabList.filter(item => {
    const todayStr = new Date().toDateString();
    return new Date(item.addedAt).toDateString() === todayStr || (item.lastReviewed && new Date(item.lastReviewed).toDateString() === todayStr);
  });

  const startDailyPlan = async () => {
    setIsGenerating(true);
    try {
        const newItems = await generateDailyContent(15, vocabList); 
        if (newItems.length === 0) { alert("词库中的新词已学完！请去进行每日巩固。"); return; }
        setTodaysItems(newItems.map(i => ({ ...i, saved: false })));
        setStudyIndex(0); setMode('study');
    } catch (e) { alert("获取新词失败"); } finally { setIsGenerating(false); }
  };

  const startTodayPractice = async () => {
    setIsGenerating(true);
    try {
      // 1. Start with overdue items
      let pool: StudyItem[] = [...overdueItems];
      
      // 2. If not enough, fill with other learned items (up to 45 max for 15 questions)
      if (pool.length < 45) {
        const remainingNeeded = 45 - pool.length;
        const otherLearned = vocabList
          .filter(v => !pool.some(p => p.id === v.id))
          .sort(() => 0.5 - Math.random());
        pool = [...pool, ...otherLearned.slice(0, remainingNeeded)];
      }

      // 3. IF STILL LESS THAN 3 (Critical for new users), fetch NEW words from repo
      if (pool.length < 3) {
          // Fetch enough new words to make at least a small session (e.g. 9 words for 3 questions)
          const needed = 9 - pool.length; 
          const newItems = await generateDailyContent(needed, vocabList);
          // Add them to the pool
          pool = [...pool, ...newItems];
      }

      if (pool.length < 3) { 
          alert("词库为空且无法获取新词，无法生成练习。"); 
          return; 
      }

      // Save the pool so we can add new words to vocabList later if they were used
      setCurrentPracticeItems(pool);

      // Limit to multiple of 3 for triplets
      const selected = pool.sort(() => 0.5 - Math.random()).slice(0, Math.min(pool.length - (pool.length % 3), 45));
      
      const exercises = await generatePracticeExercises(selected);
      setPracticeExercises(exercises);
      setMode('exercise');
    } catch (e) { 
      console.error(e);
      alert("生成巩固练习失败，请稍后重试。"); 
    } finally { 
      setIsGenerating(false); 
    }
  };

  const handleStudyComplete = (results: SessionResult[]) => {
    const now = Date.now();
    const updatedVocabList = [...vocabList];
    results.forEach(({ item, remembered }) => {
        const newLevel = remembered ? 1 : 0;
        updatedVocabList.unshift({ ...item, addedAt: now, lastReviewed: now, nextReviewAt: now + getNextReviewInterval(newLevel), masteryLevel: newLevel, saved: true } as VocabularyItem);
    });
    setVocabList(updatedVocabList);
    setDailyStats(prev => ({ ...prev, itemsLearned: prev.itemsLearned + results.length }));
    setMode('dashboard'); 
  };

  const handleExerciseComplete = (correctWords: string[]) => {
    const now = Date.now();
    
    // We need to handle both existing vocab updates AND adding new words if they were introduced during practice
    let updatedVocabList = [...vocabList];
    const newWordsAdded: VocabularyItem[] = [];

    // Map of words actually used in the generated exercises (flattened)
    const usedWords = new Set(practiceExercises.flatMap(ex => ex.targetWords));

    // 1. Identify which items from the pool were actually used
    const relevantItems = currentPracticeItems.filter(item => usedWords.has(item.text));

    relevantItems.forEach(item => {
        const existingIndex = updatedVocabList.findIndex(v => v.text === item.text);
        
        // Determine result
        // If the user got the word correct (it's in correctWords), they leveled up.
        // In the new 3-word fill-in-the-blank, if they get the whole sentence right, all 3 words are "correct".
        // If they failed, none are correct.
        
        const answeredCorrectly = correctWords.includes(item.text);
        
        let newLevel = 0;
        
        if (existingIndex >= 0) {
            // Existing Word
            const currentLevel = updatedVocabList[existingIndex].masteryLevel;
            newLevel = answeredCorrectly ? Math.min(5, currentLevel + 1) : Math.max(1, currentLevel - 1);
            
            updatedVocabList[existingIndex] = {
                ...updatedVocabList[existingIndex],
                lastReviewed: now,
                nextReviewAt: now + getNextReviewInterval(newLevel),
                masteryLevel: newLevel
            };
        } else {
            // New Word (from repo)
            // If it appeared in practice, we add it to vocab list
            newLevel = answeredCorrectly ? 1 : 0;
            const newItem: VocabularyItem = {
                ...item,
                addedAt: now,
                lastReviewed: now,
                nextReviewAt: now + getNextReviewInterval(newLevel),
                masteryLevel: newLevel,
                saved: true
            };
            newWordsAdded.push(newItem);
        }
    });

    setVocabList([...newWordsAdded, ...updatedVocabList]);
    setMode('dashboard');
  };

  const initConversation = async () => {
      if (activeSession) { setMode('live'); return; }
      setIsGenerating(true);
      try {
          const poolWords = vocabList.slice(0, 3);
          const topic = poolWords.length > 0 ? await generateTopicFromVocab(poolWords) : await generateInitialTopic();
          setActiveSession({ topic, targetWords: poolWords, history: [], lastUpdated: Date.now() });
          setMode('live');
      } catch (e) { alert("启动对话失败"); } finally { setIsGenerating(false); }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-950 text-slate-200 overflow-hidden font-sans">
      <header className="h-16 shrink-0 border-b border-slate-900 bg-slate-950 flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform" onClick={() => setMode('dashboard')}>
           <div className="bg-emerald-500/10 p-2 rounded-lg"><GraduationCap className="text-emerald-500" size={20} /></div>
           <h1 className="font-bold text-slate-100 text-lg">LinguaFlow</h1>
        </div>
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-full border border-slate-800"><Flame size={14} className="text-orange-500 fill-orange-500" /><span className="text-xs font-mono">{vocabList.length}</span></div>
            <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-white active:rotate-45 transition-all"><Settings size={20} /></button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {mode === 'dashboard' && (
           <div className="h-full overflow-y-auto p-4 pb-24 max-w-2xl mx-auto flex flex-col">
              <div className="flex justify-between items-end mb-6">
                  <h2 className="text-2xl font-bold text-white">今日计划</h2>
                  <div className="text-slate-500 text-xs">已学: {dailyStats.itemsLearned}/15</div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-8">
                  <button onClick={startDailyPlan} disabled={isGenerating} className="aspect-square text-left p-4 rounded-3xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 active:scale-95 active:bg-slate-800/80 transition-all flex flex-col justify-between">
                     <div className="p-3 w-fit rounded-2xl bg-slate-800 text-slate-400"><Book size={24} /></div>
                     <div className="text-lg font-bold text-slate-100">新词学习</div>
                  </button>
                  <button onClick={initConversation} disabled={isGenerating} className="aspect-square text-left p-4 rounded-3xl bg-gradient-to-br from-blue-900/20 to-slate-900 border border-blue-500/20 hover:border-blue-500/40 active:scale-95 active:bg-blue-900/30 transition-all flex flex-col justify-between">
                     <div className="p-3 w-fit rounded-2xl bg-blue-500/10 text-blue-400"><Mic size={24} /></div>
                     <div className="text-lg font-bold text-slate-100">情境对话</div>
                  </button>
                  <button onClick={startTodayPractice} disabled={isGenerating} className="aspect-square text-left p-4 rounded-3xl bg-slate-900 border border-slate-800 hover:border-orange-500/40 active:scale-95 active:bg-slate-800/80 transition-all relative flex flex-col justify-between">
                     <div className="p-3 w-fit rounded-2xl bg-orange-500/10 text-orange-400"><Shuffle size={24} /></div>
                     {overdueItems.length > 0 && <div className="absolute top-4 right-4 px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full animate-pulse">{overdueItems.length}</div>}
                     <div className="text-lg font-bold text-slate-100">每日巩固</div>
                  </button>
                  <button onClick={() => setMode('shadowing')} className="aspect-square text-left p-4 rounded-3xl bg-slate-900 border border-slate-800 hover:border-purple-500/40 active:scale-95 active:bg-slate-800/80 transition-all flex flex-col justify-between">
                     <div className="p-3 w-fit rounded-2xl bg-purple-500/10 text-purple-400"><Repeat size={24} /></div>
                     <div className="text-lg font-bold text-slate-100">跟读挑战</div>
                  </button>
              </div>
           </div>
        )}

        {mode === 'study' && <StudySession items={todaysItems} initialIndex={studyIndex} onProgress={setStudyIndex} onComplete={handleStudyComplete} />}
        {mode === 'exercise' && <PracticeSession exercises={practiceExercises} onBack={() => setMode('dashboard')} onComplete={handleExerciseComplete} />}
        {mode === 'live' && activeSession && <ConversationMode session={activeSession} onUpdate={setActiveSession} onEndSession={() => {setActiveSession(null); setMode('dashboard');}} onBack={() => setMode('dashboard')} onSaveVocab={(t, ty) => {}} />}
        {mode === 'shadowing' && <ShadowingMode onBack={() => setMode('dashboard')} />}

        <SettingsModal show={showSettings} onClose={() => setShowSettings(false)} vocabList={vocabList} dailyStats={dailyStats} onRestore={d => setVocabList(d.vocabList)} totalRepoCount={getTotalLocalItemsCount()} />
      </main>
    </div>
  );
};
export default App;
