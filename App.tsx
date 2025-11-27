import React, { useState, useEffect } from 'react';
import { VocabularyItem, StudyItem, DailyStats, BackupData } from './types';
import { generateDailyContent } from './services/contentGen';
import { StudySession } from './components/StudySession';
import { ConversationMode } from './components/ConversationMode';
import { DailyQuote } from './components/DailyQuote';
import { ReviewList } from './components/ReviewList';
import { SettingsModal } from './components/SettingsModal';
import { Mic, Book, CheckCircle, Flame, GraduationCap, RefreshCw, Play, X, History, Settings, AlertTriangle } from 'lucide-react';

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

  const [todaysItems, setTodaysItems] = useState<StudyItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Persistence
  useEffect(() => {
    localStorage.setItem('lingua_vocab', JSON.stringify(vocabList));
  }, [vocabList]);

  useEffect(() => {
    localStorage.setItem('lingua_stats', JSON.stringify(dailyStats));
  }, [dailyStats]);

  // Backup Reminder Logic
  useEffect(() => {
    const checkBackupStatus = () => {
        const lastBackup = localStorage.getItem('lingua_last_backup');
        const now = Date.now();
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        
        if (!lastBackup) {
            // If no backup ever, suggest one if user has been using app for a bit (e.g., has > 20 items)
            if (vocabList.length > 20) {
                setShowBackupAlert(true);
            }
        } else {
            if (now - parseInt(lastBackup) > THIRTY_DAYS) {
                setShowBackupAlert(true);
            }
        }
    };
    
    // Check on mount
    checkBackupStatus();
  }, [vocabList.length]);

  // Derived State: Get items reviewed/added today for the Review List
  const learnedToday = vocabList.filter(item => {
      const todayStr = new Date().toDateString();
      const addedDate = new Date(item.addedAt).toDateString();
      const reviewDate = item.lastReviewed ? new Date(item.lastReviewed).toDateString() : '';
      return addedDate === todayStr || reviewDate === todayStr;
  });

  // --- Handlers ---

  const startDailyPlan = async () => {
    setIsGenerating(true);
    try {
        const now = Date.now();
        // Pick items to review (older than 24h and not mastered)
        const reviewItems = vocabList
            .filter(v => v.masteryLevel < 5 && (now - v.addedAt > 86400000))
            .sort(() => 0.5 - Math.random())
            .slice(0, 5); // Review up to 5 items

        // Generate new items
        // If user has already learned 15, we can generate fewer or keep generating 15 for extra practice
        const countToGenerate = 15; 
        const newItems = await generateDailyContent(countToGenerate);

        if (newItems.length === 0 && reviewItems.length === 0) {
            alert("生成学习内容失败，请检查网络或稍后重试。");
            return;
        }

        setTodaysItems([...reviewItems, ...newItems]);
        setMode('study');
    } catch (e) {
        console.error(e);
        alert("发生错误，请重试");
    } finally {
        setIsGenerating(false);
    }
  };

  const handleStudyComplete = (learned: StudyItem[]) => {
    const now = Date.now();
    const newVocab: VocabularyItem[] = learned.map(item => {
        const existing = vocabList.find(v => v.text === item.text);
        if (existing) {
            return { 
                ...existing, 
                masteryLevel: Math.min(5, existing.masteryLevel + 1), 
                nextReviewAt: now + 86400000,
                lastReviewed: now
            };
        }
        return { 
            ...item, 
            addedAt: now, 
            nextReviewAt: now + 86400000, 
            lastReviewed: now,
            masteryLevel: 1 
        };
    });

    const updatedList = [...vocabList];
    newVocab.forEach(newItem => {
        const idx = updatedList.findIndex(v => v.text === newItem.text);
        if (idx >= 0) updatedList[idx] = newItem;
        else updatedList.unshift(newItem);
    });

    setVocabList(updatedList);
    setDailyStats(prev => ({ ...prev, itemsLearned: prev.itemsLearned + learned.length }));
    setMode('dashboard'); 
  };

  const handleRestoreData = (data: BackupData) => {
      if (data.vocabList) setVocabList(data.vocabList);
      if (data.dailyStats) setDailyStats(data.dailyStats);
      
      // Clear alert if we just restored (implies we have data now)
      setShowBackupAlert(false);
  };

  const dismissAlert = () => {
      setShowBackupAlert(false);
      // Remind again in 24 hours simply by relying on component remount logic or we could set a temp flag.
      // For now, closing it hides it for this session.
  };

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
                <span className="text-xs font-mono text-slate-300">{dailyStats.itemsLearned} 词</span>
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
              
              {/* Daily Progress Card */}
              <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-8 mb-6 md:mb-8 relative overflow-hidden shrink-0">
                  
                  <div className="relative z-10">
                      <h2 className="text-xl md:text-2xl font-bold text-white mb-2">今日目标</h2>
                      <p className="text-sm md:text-base text-slate-400 mb-6">积累词汇，然后开口练习。</p>
                      
                      {/* Stats Row */}
                      <div className="flex flex-col sm:flex-row gap-3 md:gap-4 mb-6 md:mb-8">
                         <div className={`flex-1 p-4 rounded-2xl border ${dailyStats.itemsLearned >= 15 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                             <div className="flex justify-between items-start mb-2">
                                 <Book size={20} className={dailyStats.itemsLearned >= 15 ? 'text-emerald-400' : 'text-slate-500'} />
                                 {dailyStats.itemsLearned >= 15 && <CheckCircle size={16} className="text-emerald-500" />}
                             </div>
                             <div className="text-2xl font-bold text-slate-200">{dailyStats.itemsLearned}/15</div>
                             <div className="text-xs text-slate-500">已学词汇</div>
                         </div>
                         <div className="flex-1 p-4 rounded-2xl border bg-slate-800/50 border-slate-700">
                             <div className="flex justify-between items-start mb-2">
                                 <Mic size={20} className="text-blue-500" />
                             </div>
                             <div className="text-2xl font-bold text-slate-200">随时</div>
                             <div className="text-xs text-slate-500">口语实战</div>
                         </div>
                      </div>

                      {/* Actions */}
                      <div className="space-y-3">
                          <div className="flex flex-col sm:flex-row gap-3">
                              <button 
                                onClick={startDailyPlan}
                                disabled={isGenerating}
                                className={`flex-1 py-3 md:py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
                                    isGenerating
                                    ? 'bg-slate-800 text-slate-400 cursor-wait'
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                                }`}
                              >
                                 {isGenerating ? <RefreshCw className="animate-spin" /> : <Play fill="currentColor" />}
                                 {dailyStats.itemsLearned >= 15 ? '继续学习 (已达标)' : '开始单词学习'}
                              </button>
                              
                              <button 
                                onClick={() => setMode('live')}
                                className="flex-1 py-3 md:py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                              >
                                 <Mic />
                                 口语实战
                              </button>
                          </div>
                          
                          {learnedToday.length > 0 && (
                            <button 
                                onClick={() => setMode('review')}
                                className="w-full py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 text-slate-400 text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <History size={14} /> 回顾今日所学 ({learnedToday.length})
                            </button>
                          )}
                      </div>

                  </div>
              </div>

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
                  className="absolute top-4 right-4 z-20 p-2 bg-slate-900/50 rounded-full text-slate-500 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>
                <StudySession items={todaysItems} onComplete={handleStudyComplete} />
            </div>
        )}

        {/* VIEW: REVIEW LIST */}
        {mode === 'review' && (
            <ReviewList items={learnedToday} onBack={() => setMode('dashboard')} />
        )}

        {/* VIEW: LIVE (Conversation Mode) */}
        {mode === 'live' && (
            <ConversationMode onExit={() => setMode('dashboard')} />
        )}

        {/* MODAL: SETTINGS */}
        <SettingsModal 
            show={showSettings} 
            onClose={() => setShowSettings(false)} 
            vocabList={vocabList}
            dailyStats={dailyStats}
            onRestore={handleRestoreData}
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