
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
import { Mic, Book, CheckCircle, Flame, GraduationCap, RefreshCw, Play, X, History, Settings, AlertTriangle, ArrowRight, Loader2, BarChart2, Bell, Shuffle, MessageCircle, Repeat, Target } from 'lucide-react';

type AppMode = 'dashboard' | 'study' | 'live' | 'review' | 'shadowing' | 'exercise';

// SRS Interval Helper (in milliseconds)
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
  const [showBackupAlert, setShowBackupAlert] = useState(false);
  
  // Data State
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
  const [studyIndex, setStudyIndex] = useState(0); 
  const [isGenerating, setIsGenerating] = useState(false);

  // Persistence
  useEffect(() => {
    localStorage.setItem('lingua_vocab', JSON.stringify(vocabList));
  }, [vocabList]);

  useEffect(() => {
    localStorage.setItem('lingua_stats', JSON.stringify(dailyStats));
  }, [dailyStats]);

  useEffect(() => {
    if (activeSession) {
        localStorage.setItem('lingua_conversation', JSON.stringify(activeSession));
    } else {
        localStorage.removeItem('lingua_conversation');
    }
  }, [activeSession]);

  useEffect(() => {
    const checkBackupStatus = () => {
        const lastBackup = localStorage.getItem('lingua_last_backup');
        const now = Date.now();
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        if (!lastBackup) {
            if (vocabList.length > 20) setShowBackupAlert(true);
        } else if (now - parseInt(lastBackup) > THIRTY_DAYS) {
            setShowBackupAlert(true);
        }
    };
    checkBackupStatus();
  }, [vocabList.length]);

  const learnedToday = vocabList.filter(item => {
      const todayStr = new Date().toDateString();
      const addedDate = new Date(item.addedAt).toDateString();
      const reviewDate = item.lastReviewed ? new Date(item.lastReviewed).toDateString() : '';
      return addedDate === todayStr || reviewDate === todayStr;
  });

  const overdueCount = vocabList.filter(v => v.nextReviewAt <= Date.now()).length;
  const totalRepoCount = getTotalLocalItemsCount();

  // --- Handlers ---

  const startDailyPlan = async () => {
    if (todaysItems.length > 0 && studyIndex < todaysItems.length) {
        setMode('study');
        return;
    }
    setIsGenerating(true);
    try {
        const now = Date.now();
        const todayStr = new Date().toDateString();
        const allOverdue = vocabList.filter(v => {
            const isDue = v.nextReviewAt <= now;
            const alreadyReviewedToday = v.lastReviewed ? new Date(v.lastReviewed).toDateString() === todayStr : false;
            return isDue && !alreadyReviewedToday;
        });
        allOverdue.sort((a, b) => a.masteryLevel - b.masteryLevel);
        const selectedReviewItems = allOverdue.slice(0, 25);
        let newItemsNeeded = Math.max(30 - selectedReviewItems.length, 5);
        const reviewSessionItems: StudyItem[] = selectedReviewItems.map(v => ({ ...v, saved: true }));
        const generatedItems = await generateDailyContent(newItemsNeeded, vocabList);
        const newSessionItems = generatedItems.map(item => ({ ...item, saved: false }));
        if (newSessionItems.length === 0 && reviewSessionItems.length === 0) {
            alert("恭喜！您已学完所有内容且没有待复习的单词。");
            return;
        }
        const combined = [...reviewSessionItems, ...newSessionItems].sort(() => 0.5 - Math.random());
        setTodaysItems(combined);
        setStudyIndex(0); 
        setMode('study');
    } catch (e) {
        alert("发生错误，请重试");
    } finally {
        setIsGenerating(false);
    }
  };

  const startTodayPractice = async () => {
    // Collect words from today
    let pool = learnedToday.filter(v => v.type === 'word' || v.type === 'idiom');
    
    // If not enough words from today, grab from entire vocab list
    if (pool.length < 5) {
      pool = [...vocabList].sort(() => 0.5 - Math.random()).slice(0, 5);
    } else {
      pool = [...pool].sort(() => 0.5 - Math.random()).slice(0, 5);
    }

    if (pool.length === 0) {
      alert("您的词库还是空的，请先开始每日学习！");
      return;
    }

    setIsGenerating(true);
    try {
      const exercises = await generatePracticeExercises(pool);
      setPracticeExercises(exercises);
      setMode('exercise');
    } catch (e) {
      alert("生成练习失败，请重试");
    } finally {
      setIsGenerating(false);
    }
  };

  const initConversation = async () => {
      if (activeSession) { setMode('live'); return; }
      setIsGenerating(true);
      try {
          const poolWords = vocabList.filter(v => v.type === 'word');
          const poolSentences = vocabList.filter(v => v.type === 'sentence' || v.type === 'idiom');
          let target: VocabularyItem[] = [];
          if (poolWords.length > 0) target.push(poolWords[Math.floor(Math.random() * poolWords.length)]);
          if (poolSentences.length > 0) target.push(...[...poolSentences].sort(() => 0.5 - Math.random()).slice(0, 2));
          if (target.length < 3) target.push(...vocabList.filter(v => !target.some(t => t.id === v.id)).sort(() => 0.5 - Math.random()).slice(0, 3 - target.length));
          const topic = target.length > 0 ? await generateTopicFromVocab(target) : await generateInitialTopic();
          setActiveSession({ topic, targetWords: target, history: [], lastUpdated: Date.now() });
          setMode('live');
      } catch (e) {
          alert("启动对话失败");
      } finally {
          setIsGenerating(false);
      }
  };

  const startFreeTalk = () => {
      if (activeSession && !confirm("当前已有对话，是否开始新的自由对话？")) { setMode('live'); return; }
      setActiveSession({ topic: "自由对话 (Free Talk)", targetWords: [], history: [], lastUpdated: Date.now() });
      setMode('live');
  };

  const handleStudyComplete = (results: SessionResult[]) => {
    const now = Date.now();
    const updatedVocabList = [...vocabList];
    results.forEach(({ item, remembered }) => {
        const existingIndex = updatedVocabList.findIndex(v => v.text === item.text);
        if (existingIndex >= 0) {
            const existing = updatedVocabList[existingIndex];
            if (!item.saved) updatedVocabList.splice(existingIndex, 1);
            else {
                const newLevel = remembered ? Math.min(5, existing.masteryLevel + 1) : Math.max(1, existing.masteryLevel - 1);
                updatedVocabList[existingIndex] = { ...existing, lastReviewed: now, nextReviewAt: now + getNextReviewInterval(newLevel), masteryLevel: newLevel, saved: true };
            }
        } else {
            const newLevel = remembered ? 1 : 0;
            updatedVocabList.unshift({ ...item, addedAt: now, lastReviewed: now, nextReviewAt: now + getNextReviewInterval(newLevel), masteryLevel: newLevel, saved: true } as VocabularyItem);
        }
    });
    setVocabList(updatedVocabList);
    setDailyStats(prev => ({ ...prev, itemsLearned: prev.itemsLearned + results.length }));
    setTodaysItems([]); setStudyIndex(0); setMode('dashboard'); 
  };

  const handleAddVocab = (text: string, type: ItemType) => {
    if (vocabList.some(v => v.text === text)) return;
    const newItem: VocabularyItem = { id: Math.random().toString(36).substr(2, 9), text, type, translation: "用户添加", definition: "Saved from conversation.", example: "", addedAt: Date.now(), nextReviewAt: Date.now(), masteryLevel: 0, saved: true };
    setVocabList(prev => [newItem, ...prev]);
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-950 text-slate-200 font-sans overflow-hidden">
      <header className="h-16 shrink-0 border-b border-slate-900 bg-slate-950 flex items-center justify-between px-4 md:px-6 z-10">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setMode('dashboard')}>
           <div className="bg-emerald-500/10 p-2 rounded-lg"><GraduationCap className="text-emerald-500" size={20} /></div>
           <div><h1 className="font-bold text-slate-100 text-lg leading-none">LinguaFlow</h1><p className="text-[10px] text-slate-500 font-medium tracking-wider">每日练习</p></div>
        </div>
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-full border border-slate-800"><Flame size={14} className={dailyStats.itemsLearned > 0 ? "text-orange-500 fill-orange-500" : "text-slate-600"} /><span className="text-xs font-mono text-slate-300">{vocabList.length} 词</span></div>
            <button onClick={() => setShowSettings(true)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-full transition-colors"><Settings size={20} /></button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {mode === 'dashboard' && (
           <div className="h-full overflow-y-auto p-4 md:p-6 pb-24 max-w-2xl mx-auto flex flex-col items-center">
              <div className="w-full mb-6 shrink-0">
                  <div className="flex justify-between items-end mb-4">
                      <h2 className="text-xl md:text-2xl font-bold text-white">今日练习</h2>
                      <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium bg-emerald-950/30 px-3 py-1 rounded-full border border-emerald-900/50">
                          <BarChart2 size={14} /><span>今日已学: {dailyStats.itemsLearned}</span>
                      </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button onClick={startDailyPlan} disabled={isGenerating} className={`text-left p-5 rounded-3xl border transition-all relative overflow-hidden group ${dailyStats.itemsLearned >= 15 ? 'bg-emerald-900/10 border-emerald-500/30' : 'bg-slate-900 border-slate-800'}`}>
                         <div className="flex justify-between items-start mb-6">
                             <div className="p-3 rounded-2xl bg-slate-800 text-slate-400 group-hover:text-emerald-400 transition-colors"><Book size={24} /></div>
                             {isGenerating && !activeSession ? <RefreshCw className="animate-spin text-slate-500" /> : <div className="bg-slate-950/50 p-2 rounded-full text-slate-500 group-hover:text-white"><Play size={16} fill="currentColor" /></div>}
                         </div>
                         <div className="text-3xl font-bold text-slate-100 mb-1">{todaysItems.length > 0 ? "继续学习" : "新词学习"}</div>
                         <div className="mt-3 flex gap-2">
                             {overdueCount > 0 ? <span className="text-red-400 text-sm flex items-center gap-1 font-bold animate-pulse"><Bell size={14} fill="currentColor" /> 待复习: {overdueCount}</span> : <span className="text-slate-500 text-sm flex items-center gap-1"><Target size={14} /> 计划已生成</span>}
                         </div>
                      </button>

                      <button onClick={initConversation} disabled={isGenerating} className="text-left p-5 rounded-3xl bg-gradient-to-br from-blue-900/20 to-slate-900 border border-blue-500/20 transition-all group">
                         <div className="flex justify-between items-start mb-6">
                             <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400"><Mic size={24} /></div>
                             <div className="bg-slate-950/50 p-2 rounded-full text-slate-500 group-hover:text-white">{isGenerating ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}</div>
                         </div>
                         <div className="text-3xl font-bold text-slate-100 mb-1">{activeSession ? "继续对话" : "场景演练"}</div>
                         <p className="text-sm text-slate-500 truncate">{activeSession ? `当前: ${activeSession.topic}` : "模拟真实对话场景"}</p>
                      </button>
                  </div>
              </div>

              <div className="w-full mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
                  <button onClick={startTodayPractice} disabled={isGenerating} className="text-left p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-emerald-500/30 transition-all group relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl -mr-8 -mt-8"></div>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 group-hover:scale-110 transition-transform"><Shuffle size={24} /></div>
                        <div className="bg-slate-950/50 p-2 rounded-full text-slate-600 group-hover:text-white transition-colors">{isGenerating ? <Loader2 className="animate-spin" size={14} /> : <ArrowRight size={14} />}</div>
                      </div>
                      <h3 className="text-xl font-bold text-slate-100 mb-1">每日巩固</h3>
                      <p className="text-xs text-slate-500">今日词汇 · 造句挑战</p>
                  </button>

                  <button onClick={() => setMode('shadowing')} className="text-left p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-purple-500/30 transition-all group">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-400 group-hover:scale-110 transition-transform"><Repeat size={24} /></div>
                        <div className="bg-slate-950/50 p-2 rounded-full text-slate-600 group-hover:text-white transition-colors"><ArrowRight size={14} /></div>
                      </div>
                      <h3 className="text-xl font-bold text-slate-100 mb-1">跟读练习</h3>
                      <p className="text-xs text-slate-500">听音模仿 · 逐句纠音</p>
                  </button>
              </div>

              <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shrink-0">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">最近学习</h3>
                <div className="space-y-3">
                    {vocabList.slice(0, 5).map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm border-b border-slate-800/50 pb-2 last:border-0">
                            <div className="max-w-[70%]"><span className="text-slate-300 block truncate">{item.text}</span><span className="text-xs text-slate-500 block truncate">{item.translation}</span></div>
                            <span className="text-xs text-slate-600 bg-slate-950 px-2 py-0.5 rounded">Lv {item.masteryLevel}</span>
                        </div>
                    ))}
                    {vocabList.length === 0 && <p className="text-slate-600 text-sm italic">暂无记录。</p>}
                </div>
              </div>
           </div>
        )}

        {mode === 'study' && (
            <div className="h-full relative bg-slate-950">
                <button onClick={() => setMode('dashboard')} className="absolute top-4 left-4 z-20 p-2 bg-slate-900/50 rounded-full text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
                <StudySession items={todaysItems} initialIndex={studyIndex} onProgress={setStudyIndex} onComplete={handleStudyComplete} />
            </div>
        )}

        {mode === 'exercise' && practiceExercises.length > 0 && (
          <PracticeSession exercises={practiceExercises} onBack={() => setMode('dashboard')} onComplete={() => setMode('dashboard')} />
        )}

        {mode === 'review' && <ReviewList items={learnedToday} onBack={() => setMode('dashboard')} />}
        {mode === 'live' && activeSession && <ConversationMode session={activeSession} onUpdate={setActiveSession} onEndSession={() => {setActiveSession(null); setMode('dashboard');}} onBack={() => setMode('dashboard')} onSaveVocab={handleAddVocab} />}
        {mode === 'shadowing' && <ShadowingMode onBack={() => setMode('dashboard')} />}

        <SettingsModal show={showSettings} onClose={() => setShowSettings(false)} vocabList={vocabList} dailyStats={dailyStats} onRestore={data => {setVocabList(data.vocabList); setDailyStats(data.dailyStats);}} totalRepoCount={totalRepoCount} />
      </main>
    </div>
  );
};

export default App;
