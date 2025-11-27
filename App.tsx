import React, { useState, useEffect } from 'react';
import { ConnectionState, VocabularyItem, StudyItem, DailyStats } from './types';
import { generateDailyContent } from './services/contentGen';
import { StudySession } from './components/StudySession';
import { ConversationMode } from './components/ConversationMode';
import { DailyQuote } from './components/DailyQuote';
import { Mic, Book, CheckCircle, Flame, GraduationCap, RefreshCw, Play, X } from 'lucide-react';

type AppMode = 'dashboard' | 'study' | 'live';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('dashboard');
  
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

  // --- Handlers ---

  const startDailyPlan = async () => {
    setIsGenerating(true);
    try {
        const now = Date.now();
        const reviewItems = vocabList
            .filter(v => v.masteryLevel < 5 && (now - v.addedAt > 86400000))
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);

        const newCount = 15;
        const newItems = await generateDailyContent(newCount);

        setTodaysItems([...reviewItems, ...newItems]);
        setMode('study');
    } finally {
        setIsGenerating(false);
    }
  };

  const handleStudyComplete = (learned: StudyItem[]) => {
    const newVocab: VocabularyItem[] = learned.map(item => {
        const existing = vocabList.find(v => v.text === item.text);
        if (existing) {
            return { ...existing, masteryLevel: Math.min(5, existing.masteryLevel + 1), nextReviewAt: Date.now() + 86400000 };
        }
        return { 
            ...item, 
            addedAt: Date.now(), 
            nextReviewAt: Date.now() + 86400000, 
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

  // --- Render ---

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      
      {/* Top Navigation */}
      <header className="h-16 border-b border-slate-900 bg-slate-950 flex items-center justify-between px-6 z-10">
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
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        
        {/* VIEW: DASHBOARD */}
        {mode === 'dashboard' && (
           <div className="h-full overflow-y-auto p-6 max-w-2xl mx-auto flex flex-col items-center">
              
              {/* Daily Progress Card */}
              <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 mb-8 relative overflow-hidden">
                  
                  <div className="relative z-10">
                      <h2 className="text-2xl font-bold text-white mb-2">今日目标</h2>
                      <p className="text-slate-400 mb-6">积累词汇，然后开口练习。</p>
                      
                      <div className="flex gap-4 mb-8">
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

                      <div className="flex gap-3">
                          <button 
                            onClick={startDailyPlan}
                            disabled={isGenerating || dailyStats.itemsLearned >= 15}
                            className={`flex-1 py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2 ${
                                dailyStats.itemsLearned >= 15 
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                            }`}
                          >
                             {isGenerating ? <RefreshCw className="animate-spin" /> : <Play fill="currentColor" />}
                             {dailyStats.itemsLearned >= 15 ? '今日已完成' : '开始单词学习'}
                          </button>
                          
                          <button 
                            onClick={() => setMode('live')}
                            className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                          >
                             <Mic />
                             口语实战
                          </button>
                      </div>
                  </div>
              </div>

              {/* Daily Quote Section */}
              <div className="w-full mb-8">
                  <DailyQuote />
              </div>

              {/* Recent Vocab List */}
              <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">最近学习</h3>
                <div className="space-y-3">
                    {vocabList.slice(0, 5).map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm border-b border-slate-800/50 pb-2 last:border-0">
                            <div>
                                <span className="text-slate-300 block">{item.text}</span>
                                <span className="text-xs text-slate-500 block">{item.translation}</span>
                            </div>
                            <span className="text-xs text-slate-600 bg-slate-950 px-2 py-0.5 rounded">Lv {item.masteryLevel}</span>
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
                  className="absolute top-4 right-4 z-20 text-slate-500 hover:text-slate-300"
                >
                    <X />
                </button>
                <StudySession items={todaysItems} onComplete={handleStudyComplete} />
            </div>
        )}

        {/* VIEW: LIVE (New Conversation Mode) */}
        {mode === 'live' && (
            <ConversationMode onExit={() => setMode('dashboard')} />
        )}

      </main>
    </div>
  );
};

export default App;
