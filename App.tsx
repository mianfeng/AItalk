import React, { useState, useEffect, useRef } from 'react';
import { ConnectionState, Message, VocabularyItem, StudyItem, DailyStats } from './types';
import { LiveSession } from './services/geminiLive';
import { generateDailyContent } from './services/contentGen';
import { Visualizer } from './components/Visualizer';
import { ChatMessage } from './components/ChatMessage';
import { StudySession } from './components/StudySession';
import { Mic, MicOff, Book, CheckCircle, Flame, Calendar, RefreshCw, Play, GraduationCap, X } from 'lucide-react';

type AppMode = 'dashboard' | 'study' | 'live';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('dashboard');
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  
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

  // Live Session State
  const [messages, setMessages] = useState<Message[]>([]);
  const [amplitude, setAmplitude] = useState<number>(0);
  const liveSessionRef = useRef<LiveSession | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem('lingua_vocab', JSON.stringify(vocabList));
  }, [vocabList]);

  useEffect(() => {
    localStorage.setItem('lingua_stats', JSON.stringify(dailyStats));
  }, [dailyStats]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => scrollToBottom(), [messages]);

  // --- Handlers ---

  const startDailyPlan = async () => {
    setIsGenerating(true);
    try {
        // 1. Get items to review (simple logic: items added > 1 day ago)
        const now = Date.now();
        const reviewItems = vocabList
            .filter(v => v.masteryLevel < 5 && (now - v.addedAt > 86400000))
            .sort(() => 0.5 - Math.random())
            .slice(0, 3);

        // 2. Generate new items
        // User requested 15 items per day
        const newCount = 15;
        const newItems = await generateDailyContent(newCount);

        setTodaysItems([...reviewItems, ...newItems]);
        setMode('study');
    } finally {
        setIsGenerating(false);
    }
  };

  const handleStudyComplete = (learned: StudyItem[]) => {
    // Merge new items into vocab list
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

    // Update list ensuring no dupes (simplified)
    const updatedList = [...vocabList];
    newVocab.forEach(newItem => {
        const idx = updatedList.findIndex(v => v.text === newItem.text);
        if (idx >= 0) updatedList[idx] = newItem;
        else updatedList.unshift(newItem);
    });

    setVocabList(updatedList);
    setDailyStats(prev => ({ ...prev, itemsLearned: prev.itemsLearned + learned.length }));
    setMode('dashboard'); // Return to dashboard to prompt "Start Speaking"
  };

  const startSpeakingSession = async () => {
    setMode('live');
    if (connectionState === ConnectionState.DISCONNECTED) {
        // Construct a specific prompt based on today's learning
        // We take the first few words to prompt the model, otherwise the prompt is too long
        const recentWords = vocabList.slice(0, 8).map(v => v.text).join(', ');
        
        const systemInstruction = `You are an expert English speaking coach. 
        The user is a Chinese speaker learning English.
        The user has just studied these words/phrases: [ ${recentWords} ]. 
        1. Your goal is to help them PRACTICE these specific words in a natural roleplay.
        2. Start by proposing a scenario that fits these words (e.g., office, coffee shop).
        3. Listen carefully to their intonation. If they sound flat or robotic, correct them gently.
        4. If they make a grammar mistake, correct it instantly but briefly.
        5. Keep the conversation going! Speak clearly.`;

        liveSessionRef.current = new LiveSession({
            onConnectionStateChange: setConnectionState,
            onTranscriptUpdate: (msg) => setMessages(prev => [...prev, msg]),
            onAudioData: setAmplitude,
            systemInstruction: systemInstruction
        });
        await liveSessionRef.current.connect();
    }
  };

  const toggleConnection = async () => {
    if (connectionState === ConnectionState.CONNECTED || connectionState === ConnectionState.CONNECTING) {
        await liveSessionRef.current?.disconnect();
        liveSessionRef.current = null;
        setDailyStats(prev => ({ ...prev, completedSpeaking: true }));
    } else {
        await startSpeakingSession();
    }
  };

  const endLiveSession = async () => {
    if (liveSessionRef.current) {
        await liveSessionRef.current.disconnect();
    }
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
            {mode === 'live' && (
               <button onClick={endLiveSession} className="p-2 hover:bg-slate-800 rounded-full text-slate-400">
                   <X size={20} />
               </button>
            )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        
        {/* VIEW: DASHBOARD */}
        {mode === 'dashboard' && (
           <div className="h-full overflow-y-auto p-6 max-w-2xl mx-auto flex flex-col items-center">
              
              {/* Daily Progress Card */}
              <div className="w-full bg-gradient-to-br from-slate-900 to-slate-900 border border-slate-800 rounded-3xl p-8 mb-8 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                  
                  <div className="relative z-10">
                      <h2 className="text-2xl font-bold text-white mb-2">今日目标</h2>
                      <p className="text-slate-400 mb-6">开口前，先建立词汇储备。</p>
                      
                      <div className="flex gap-4 mb-8">
                         <div className={`flex-1 p-4 rounded-2xl border ${dailyStats.itemsLearned >= 15 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                             <div className="flex justify-between items-start mb-2">
                                 <Book size={20} className={dailyStats.itemsLearned >= 15 ? 'text-emerald-400' : 'text-slate-500'} />
                                 {dailyStats.itemsLearned >= 15 && <CheckCircle size={16} className="text-emerald-500" />}
                             </div>
                             <div className="text-2xl font-bold text-slate-200">{dailyStats.itemsLearned}/15</div>
                             <div className="text-xs text-slate-500">已学词汇</div>
                         </div>
                         <div className={`flex-1 p-4 rounded-2xl border ${dailyStats.completedSpeaking ? 'bg-blue-500/10 border-blue-500/30' : 'bg-slate-800/50 border-slate-700'}`}>
                             <div className="flex justify-between items-start mb-2">
                                 <Mic size={20} className={dailyStats.completedSpeaking ? 'text-blue-400' : 'text-slate-500'} />
                                 {dailyStats.completedSpeaking && <CheckCircle size={16} className="text-blue-500" />}
                             </div>
                             <div className="text-2xl font-bold text-slate-200">{dailyStats.completedSpeaking ? '已完成' : '待完成'}</div>
                             <div className="text-xs text-slate-500">口语实战</div>
                         </div>
                      </div>

                      {dailyStats.itemsLearned < 15 ? (
                          <button 
                            onClick={startDailyPlan}
                            disabled={isGenerating}
                            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                          >
                             {isGenerating ? <RefreshCw className="animate-spin" /> : <Play fill="currentColor" />}
                             {isGenerating ? '正在生成计划...' : '开始今日学习 (15个)'}
                          </button>
                      ) : (
                          <button 
                            onClick={startSpeakingSession}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 animate-pulse"
                          >
                             <Mic />
                             开始口语对话
                          </button>
                      )}
                  </div>
              </div>

              {/* Stats / Notebook Teaser */}
              <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">词汇积累</h3>
                    <div className="space-y-3">
                        {vocabList.slice(0, 3).map((item, i) => (
                            <div key={i} className="flex justify-between items-center text-sm border-b border-slate-800/50 pb-2 last:border-0">
                                <span className="text-slate-300">{item.text}</span>
                                <span className="text-xs text-slate-600 bg-slate-900 px-2 py-0.5 rounded">Lv {item.masteryLevel}</span>
                            </div>
                        ))}
                        {vocabList.length === 0 && <p className="text-slate-600 text-sm italic">暂无积累单词。</p>}
                    </div>
                 </div>
                 <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-center items-center text-center">
                    <Calendar size={32} className="text-slate-700 mb-2" />
                    <p className="text-slate-400 text-sm">持之以恒是关键。</p>
                    <p className="text-xs text-slate-600 mt-1">明天记得回来学习新内容！</p>
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

        {/* VIEW: LIVE PRACTICE */}
        {mode === 'live' && (
            <div className="h-full flex flex-col">
                {/* Visualizer Header */}
                <div className="h-48 bg-slate-900 border-b border-slate-800 flex flex-col items-center justify-center relative shrink-0">
                    <Visualizer isActive={connectionState === ConnectionState.CONNECTED} amplitude={amplitude} />
                    <div className="absolute bottom-4 flex gap-4">
                        <button
                        onClick={toggleConnection}
                        disabled={connectionState === ConnectionState.CONNECTING}
                        className={`h-12 w-12 rounded-full flex items-center justify-center shadow-lg transition-all ${
                            connectionState === ConnectionState.CONNECTED 
                            ? 'bg-red-500 hover:bg-red-600 text-white' 
                            : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                        }`}
                        >
                        {connectionState === ConnectionState.CONNECTED ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                    </div>
                </div>

                {/* Chat Transcript */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-950">
                    <div className="max-w-2xl mx-auto">
                        {messages.length === 0 && (
                            <div className="text-center text-slate-500 mt-12">
                                <p>正在连接 AI 教练...</p>
                                <p className="text-sm mt-2">主题：复习今日所学词汇。</p>
                            </div>
                        )}
                        {messages.map((msg) => (
                            <ChatMessage 
                              key={msg.id} 
                              message={msg} 
                              onSaveVocab={() => {}} // Disabled in practice mode as we are practicing what we saved
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                </div>
            </div>
        )}

      </main>
    </div>
  );
};

export default App;