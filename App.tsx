import React, { useState, useEffect, useRef } from 'react';
import { VocabularyItem, StudyItem, DailyStats, BackupData, ItemType, SessionResult, ConversationSession } from './types';
import { generateDailyContent, generateInitialTopic, generateTopicFromVocab } from './services/contentGen';
import { getTotalLocalItemsCount } from './services/localRepository';
import { StudySession } from './components/StudySession';
import { ConversationMode } from './components/ConversationMode';
import { DailyQuote } from './components/DailyQuote';
import { ReviewList } from './components/ReviewList';
import { SettingsModal } from './components/SettingsModal';
import { Mic, Book, CheckCircle, Flame, GraduationCap, RefreshCw, Play, X, History, Settings, AlertTriangle, ArrowRight, Loader2, BarChart2 } from 'lucide-react';

type AppMode = 'dashboard' | 'study' | 'live' | 'review';

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

  // Conversation Persistence State
  const [activeSession, setActiveSession] = useState<ConversationSession | null>(() => {
      const saved = localStorage.getItem('lingua_conversation');
      return saved ? JSON.parse(saved) : null;
  });

  const [todaysItems, setTodaysItems] = useState<StudyItem[]>([]);
  // Persistence for Study Index
  const [studyIndex, setStudyIndex] = useState(0); 
  const [isGenerating, setIsGenerating] = useState(false);

  // Global Audio Cache for Study Session
  const audioCache = useRef<Map<string, string>>(new Map());

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

  // Backup Reminder Logic
  useEffect(() => {
    const checkBackupStatus = () => {
        const lastBackup = localStorage.getItem('lingua_last_backup');
        const now = Date.now();
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        
        if (!lastBackup) {
            if (vocabList.length > 20) {
                setShowBackupAlert(true);
            }
        } else {
            if (now - parseInt(lastBackup) > THIRTY_DAYS) {
                setShowBackupAlert(true);
            }
        }
    };
    
    checkBackupStatus();
  }, [vocabList.length]);

  // Derived State: Get items reviewed/added today for the Review List
  const learnedToday = vocabList.filter(item => {
      const todayStr = new Date().toDateString();
      const addedDate = new Date(item.addedAt).toDateString();
      const reviewDate = item.lastReviewed ? new Date(item.lastReviewed).toDateString() : '';
      return addedDate === todayStr || reviewDate === todayStr;
  });

  const totalRepoCount = getTotalLocalItemsCount();

  // --- Handlers ---

  const startDailyPlan = async () => {
    // If we have items and haven't finished, just resume
    if (todaysItems.length > 0 && studyIndex < todaysItems.length) {
        setMode('study');
        return;
    }

    setIsGenerating(true);
    try {
        const now = Date.now();
        const ONE_DAY = 86400000;
        const todayStr = new Date().toDateString();
        
        // 1. Identify "Items to Review" (Review Queue)
        // Criteria A: Studied Yesterday (Reinforce Memory)
        const yesterdayStr = new Date(now - ONE_DAY).toDateString();
        const yesterdayItems = vocabList.filter(v => {
            const added = new Date(v.addedAt).toDateString();
            const reviewed = v.lastReviewed ? new Date(v.lastReviewed).toDateString() : '';
            // Only include if NOT reviewed today yet (to avoid immediate repetition in multi-session days)
            const reviewedToday = v.lastReviewed ? new Date(v.lastReviewed).toDateString() === todayStr : false;
            return (added === yesterdayStr || reviewed === yesterdayStr) && !reviewedToday;
        });

        // Criteria B: Mastery Level < 3 (Needs Review / Hard items)
        const weakItems = vocabList.filter(v => 
            v.masteryLevel < 3 && 
            !yesterdayItems.includes(v) &&
            (now - v.addedAt > ONE_DAY) &&
            // EXCLUDE items already reviewed TODAY
            (!v.lastReviewed || new Date(v.lastReviewed).toDateString() !== todayStr)
        );

        // Selection Logic: 50% Review, 50% New
        const reviewQuota = 10;
        let selectedReviewItems: VocabularyItem[] = [];

        // Add all from yesterday (up to quota)
        selectedReviewItems = [...selectedReviewItems, ...yesterdayItems];
        
        // Fill remaining quota with weak items
        if (selectedReviewItems.length < reviewQuota) {
            const needed = reviewQuota - selectedReviewItems.length;
            const shuffledWeak = weakItems.sort(() => 0.5 - Math.random());
            selectedReviewItems = [...selectedReviewItems, ...shuffledWeak.slice(0, needed)];
        }

        // If still need more, pick random older items
        if (selectedReviewItems.length < reviewQuota) {
             const needed = reviewQuota - selectedReviewItems.length;
             const others = vocabList.filter(v => 
                !selectedReviewItems.includes(v) && 
                (now - v.addedAt > ONE_DAY) &&
                // EXCLUDE items already reviewed TODAY
                (!v.lastReviewed || new Date(v.lastReviewed).toDateString() !== todayStr)
             );
             const shuffledOthers = others.sort(() => 0.5 - Math.random());
             selectedReviewItems = [...selectedReviewItems, ...shuffledOthers.slice(0, needed)];
        }

        const reviewSessionItems: StudyItem[] = selectedReviewItems.map(v => ({ ...v, saved: true }));

        // 2. Generate "New Items"
        const newQuota = 20 - reviewSessionItems.length; 
        const countToGenerate = Math.max(10, newQuota); 
        
        // generateDailyContent now handles the ratio internally (Words vs Sentences)
        const generatedItems = await generateDailyContent(countToGenerate, vocabList);
        const newSessionItems = generatedItems.map(item => ({ ...item, saved: false }));

        if (newSessionItems.length === 0 && reviewSessionItems.length === 0) {
            alert("词库已学完，或者没有需要复习的内容！");
            setIsGenerating(false);
            return;
        }

        setTodaysItems([...reviewSessionItems, ...newSessionItems]);
        setStudyIndex(0); 
        audioCache.current.clear(); 
        
        setMode('study');
    } catch (e) {
        console.error(e);
        alert("发生错误，请重试");
    } finally {
        setIsGenerating(false);
    }
  };

  const initConversation = async () => {
      // If session exists, resume it
      if (activeSession) {
          setMode('live');
          return;
      }

      // Generate NEW session
      setIsGenerating(true);
      try {
          // Logic: 1 Word + 2 Sentences/Idioms
          const poolWords = vocabList.filter(v => v.type === 'word');
          const poolSentences = vocabList.filter(v => v.type === 'sentence' || v.type === 'idiom');
          
          let target: VocabularyItem[] = [];

          // Try to pick 1 word
          if (poolWords.length > 0) {
              const randomWord = poolWords[Math.floor(Math.random() * poolWords.length)];
              target.push(randomWord);
          }

          // Try to pick 2 sentences
          if (poolSentences.length > 0) {
              const shuffledSentences = [...poolSentences].sort(() => 0.5 - Math.random());
              target.push(...shuffledSentences.slice(0, 2));
          }

          // Fallback: If we didn't get 3 items, fill up with whatever we have left from the OTHER pool
          // (e.g. user only has words, no sentences)
          if (target.length < 3) {
              const usedIds = new Set(target.map(t => t.id));
              const remaining = vocabList.filter(v => !usedIds.has(v.id)).sort(() => 0.5 - Math.random());
              target.push(...remaining.slice(0, 3 - target.length));
          }

          // Generate Topic
          let topic = "Daily Conversation";
          if (target.length > 0) {
              topic = await generateTopicFromVocab(target);
          } else {
              topic = await generateInitialTopic();
          }

          const newSession: ConversationSession = {
              topic,
              targetWords: target,
              history: [],
              lastUpdated: Date.now()
          };

          setActiveSession(newSession);
          setMode('live');

      } catch (e) {
          console.error("Failed to init conversation", e);
          alert("启动对话失败，请检查网络或配置");
      } finally {
          setIsGenerating(false);
      }
  };

  const handleConversationUpdate = (updatedSession: ConversationSession) => {
      setActiveSession(updatedSession);
  };

  const handleEndConversation = () => {
      if(confirm("确定要结束当前话题吗？进度将不会保存，下次将开启新话题。")) {
          setActiveSession(null);
          setMode('dashboard');
      }
  };

  const handleStudyProgress = (index: number) => {
      setStudyIndex(index);
  };

  const handleStudyComplete = (results: SessionResult[]) => {
    const now = Date.now();
    const updatedVocabList = [...vocabList];

    results.forEach(({ item, remembered }) => {
        if (item.saved) {
            const existingIndex = updatedVocabList.findIndex(v => v.text === item.text);
            
            if (existingIndex >= 0) {
                const existing = updatedVocabList[existingIndex];
                updatedVocabList[existingIndex] = {
                    ...existing,
                    lastReviewed: now,
                    nextReviewAt: now + 86400000,
                    masteryLevel: remembered ? Math.min(5, existing.masteryLevel + 1) : Math.max(1, existing.masteryLevel - 1)
                };
            } else {
                // If it was marked as saved during the session (heart icon), add it
                updatedVocabList.unshift({
                    ...item,
                    addedAt: now,
                    lastReviewed: now,
                    nextReviewAt: now + 86400000,
                    masteryLevel: remembered ? 1 : 0
                });
            }
        } 
        else {
            // Check if user un-saved it
            const existingIndex = updatedVocabList.findIndex(v => v.text === item.text);
            if (existingIndex >= 0) {
                updatedVocabList.splice(existingIndex, 1);
            }
        }
    });

    setVocabList(updatedVocabList);
    setDailyStats(prev => ({ ...prev, itemsLearned: prev.itemsLearned + results.length }));
    setTodaysItems([]); 
    setStudyIndex(0);
    audioCache.current.clear(); 
    setMode('dashboard'); 
  };

  const handleAddVocab = (text: string, type: ItemType) => {
    if (vocabList.some(v => v.text === text)) {
      alert("该词汇已在您的列表中！");
      return;
    }

    const newItem: VocabularyItem = {
      id: Math.random().toString(36).substr(2, 9),
      text,
      type,
      translation: "用户添加", 
      definition: "Saved from conversation.",
      example: "",
      addedAt: Date.now(),
      nextReviewAt: Date.now(),
      masteryLevel: 0,
      saved: true
    };

    setVocabList(prev => [newItem, ...prev]);
  };

  const handleRestoreData = (data: BackupData) => {
      if (data.vocabList) setVocabList(data.vocabList);
      if (data.dailyStats) setDailyStats(data.dailyStats);
      setShowBackupAlert(false);
  };

  const dismissAlert = () => {
      setShowBackupAlert(false);
  };

  const isSessionActive = todaysItems.length > 0 && studyIndex < todaysItems.length;

  // --- Render ---

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-950 text-slate-200 font-sans overflow-hidden">
      
      {/* Top Navigation */}
      <header className="h-16 shrink-0 border-b border-slate-900 bg-slate-950 flex items-center justify-between px-4 md:px-6 z-10">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setMode('dashboard')}>
           <div className="bg-emerald-500/10 p-2 rounded-lg">
             <GraduationCap className="text-emerald-500" size={20} />
           </div>
           <div>
               <h1 className="font-bold text-slate-100 text-lg leading-none">LinguaFlow</h1>
               <p className="text-[10px] text-slate-500 font-medium tracking-wider">每日练习</p>
           </div>
        </div>

        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-full border border-slate-800">
                <Flame size={14} className={dailyStats.itemsLearned > 0 ? "text-orange-500 fill-orange-500" : "text-slate-600"} />
                {/* Shows Total Words Collected */}
                <span className="text-xs font-mono text-slate-300">{vocabList.length} 词</span>
            </div>
            <button 
                onClick={() => setShowSettings(true)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-full transition-colors"
            >
                <Settings size={20} />
            </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        
        {/* VIEW: DASHBOARD */}
        {mode === 'dashboard' && (
           <div className="h-full overflow-y-auto p-4 md:p-6 pb-24 max-w-2xl mx-auto flex flex-col items-center">
              
              {/* Daily Progress / Action Cards (Consolidated) */}
              <div className="w-full mb-6 md:mb-8 shrink-0">
                  <div className="flex justify-between items-end mb-4">
                      <h2 className="text-xl md:text-2xl font-bold text-white">今日练习</h2>
                      <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium bg-emerald-950/30 px-3 py-1 rounded-full border border-emerald-900/50">
                          <BarChart2 size={14} />
                          <span>今日已学: {dailyStats.itemsLearned}</span>
                      </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      {/* Left Card: Vocab Study */}
                      <button 
                        onClick={startDailyPlan}
                        disabled={isGenerating}
                        className={`text-left p-5 rounded-3xl border transition-all relative overflow-hidden group ${
                            dailyStats.itemsLearned >= 15 && !isSessionActive
                            ? 'bg-emerald-900/10 border-emerald-500/30 hover:bg-emerald-900/20' 
                            : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800'
                        }`}
                      >
                         <div className="flex justify-between items-start mb-6 relative z-10">
                             <div className={`p-3 rounded-2xl ${dailyStats.itemsLearned >= 15 && !isSessionActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400 group-hover:text-emerald-400 group-hover:bg-slate-950 transition-colors'}`}>
                                <Book size={24} />
                             </div>
                             {isGenerating && !activeSession ? ( // Only spin if generating vocab
                                 <RefreshCw className="animate-spin text-slate-500" />
                             ) : (
                                 <div className="bg-slate-950/50 p-2 rounded-full text-slate-500 group-hover:text-white transition-colors">
                                     <Play size={16} fill="currentColor" />
                                 </div>
                             )}
                         </div>
                         
                         <div className="relative z-10">
                             <div className="text-3xl font-bold text-slate-100 mb-1">
                                {isSessionActive ? "继续学习" : "单词学习"}
                             </div>
                             
                             <div className="h-5"></div>

                             {isSessionActive && (
                                 <div className="mt-3 text-xs bg-emerald-500/10 text-emerald-400 inline-block px-2 py-1 rounded border border-emerald-500/20">
                                     剩余 {todaysItems.length - studyIndex} 个
                                 </div>
                             )}
                             
                             {!isSessionActive && dailyStats.itemsLearned >= 15 && (
                                 <div className="mt-3 text-emerald-400 text-sm flex items-center gap-1">
                                     <CheckCircle size={14} /> 今日目标达成
                                 </div>
                             )}
                         </div>
                      </button>

                      {/* Right Card: Oral Practice */}
                      <button 
                        onClick={initConversation}
                        disabled={isGenerating}
                        className={`text-left p-5 rounded-3xl bg-gradient-to-br from-blue-900/20 to-slate-900 border transition-all relative overflow-hidden group ${
                            activeSession 
                            ? 'border-blue-500/40 from-blue-900/40' 
                            : 'border-blue-500/20 hover:border-blue-500/40 hover:from-blue-900/30'
                        }`}
                      >
                         <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

                         <div className="flex justify-between items-start mb-6 relative z-10">
                             <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 group-hover:scale-110 transition-transform">
                                <Mic size={24} />
                             </div>
                             <div className="bg-slate-950/50 p-2 rounded-full text-slate-500 group-hover:text-white transition-colors">
                                 {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
                             </div>
                         </div>
                         
                         <div className="relative z-10">
                             <div className="text-3xl font-bold text-slate-100 mb-1">
                                 {activeSession ? "继续对话" : "口语实战"}
                             </div>
                             <p className="text-sm text-slate-500 truncate">
                                 {activeSession ? `话题: ${activeSession.topic}` : "模拟真实对话场景"}
                             </p>
                             <div className="mt-3 text-xs text-blue-300/60 flex items-center gap-1">
                                 {activeSession ? "点击恢复进度" : "随时开始 · 智能纠音"}
                             </div>
                         </div>
                      </button>

                  </div>
              </div>

              {/* Review Entry */}
              {learnedToday.length > 0 && (
                <button 
                    onClick={() => setMode('review')}
                    className="w-full mb-8 bg-slate-900/50 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 p-4 rounded-xl flex items-center justify-between group transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <History size={18} className="text-slate-500 group-hover:text-emerald-400 transition-colors" />
                        <span className="text-slate-300 font-medium text-sm">回顾今日所学单词 ({learnedToday.length})</span>
                    </div>
                    <ArrowRight size={16} className="text-slate-600 group-hover:text-slate-300" />
                </button>
              )}

              {/* Daily Quote Section */}
              <div className="w-full mb-6 md:mb-8 shrink-0">
                  <DailyQuote />
              </div>

              {/* Recent Vocab List (Short Preview) */}
              <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shrink-0">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">最近学习</h3>
                <div className="space-y-3">
                    {vocabList.slice(0, 5).map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm border-b border-slate-800/50 pb-2 last:border-0">
                            <div className="max-w-[70%]">
                                <span className="text-slate-300 block truncate">{item.text}</span>
                                <span className="text-xs text-slate-500 block truncate">{item.translation}</span>
                            </div>
                            <span className="text-xs text-slate-600 bg-slate-950 px-2 py-0.5 rounded shrink-0">Lv {item.masteryLevel}</span>
                        </div>
                    ))}
                    {vocabList.length === 0 && <p className="text-slate-600 text-sm italic">暂无记录。</p>}
                </div>
              </div>

           </div>
        )}

        {/* VIEW: STUDY */}
        {mode === 'study' && (
            <div className="h-full relative bg-slate-950">
                <button 
                  onClick={() => setMode('dashboard')} 
                  className="absolute top-4 left-4 z-20 p-2 bg-slate-900/50 rounded-full text-slate-500 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>
                <StudySession 
                    items={todaysItems} 
                    initialIndex={studyIndex}
                    onProgress={handleStudyProgress}
                    onComplete={handleStudyComplete}
                    audioCache={audioCache.current} 
                />
            </div>
        )}

        {/* VIEW: REVIEW LIST */}
        {mode === 'review' && (
            <ReviewList items={learnedToday} onBack={() => setMode('dashboard')} />
        )}

        {/* VIEW: LIVE (Conversation Mode) */}
        {mode === 'live' && activeSession && (
            <ConversationMode 
                session={activeSession}
                onUpdate={handleConversationUpdate}
                onEndSession={handleEndConversation}
                onBack={() => setMode('dashboard')}
                onSaveVocab={handleAddVocab} 
            />
        )}

        {/* MODAL: SETTINGS */}
        <SettingsModal 
            show={showSettings} 
            onClose={() => setShowSettings(false)} 
            vocabList={vocabList}
            dailyStats={dailyStats}
            onRestore={handleRestoreData}
            totalRepoCount={totalRepoCount}
        />

        {/* BACKUP REMINDER BANNER */}
        {showBackupAlert && mode === 'dashboard' && (
            <div className="absolute bottom-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-lg bg-amber-500/10 border border-amber-500/50 backdrop-blur-md rounded-xl p-4 shadow-xl flex items-center justify-between z-40 animate-in slide-in-from-bottom-5">
                <div className="flex items-center gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0" size={20} />
                    <div className="text-sm">
                        <p className="text-amber-200 font-bold">建议备份数据</p>
                        <p className="text-amber-400/80 text-xs">您已超过30天未备份学习记录。</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowSettings(true)}
                        className="px-3 py-1.5 bg-amber-500 text-slate-900 text-xs font-bold rounded-lg hover:bg-amber-400"
                    >
                        去备份
                    </button>
                    <button onClick={dismissAlert} className="p-1 text-amber-500/50 hover:text-amber-500">
                        <X size={16} />
                    </button>
                </div>
            </div>
        )}

      </main>
    </div>
  );
};

export default App;