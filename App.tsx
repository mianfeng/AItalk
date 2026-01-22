
import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Settings, 
  Brain, 
  History, 
  Mic2, 
  MessageSquare,
  Loader2 
} from 'lucide-react';
import { 
  VocabularyItem, 
  DailyStats, 
  StudyItem, 
  PracticeExercise, 
  ConversationSession, 
  BackupData, 
  SessionResult 
} from './types';
import { 
  generateDailyContent, 
  generatePracticeExercises, 
  generateInitialTopic, 
  generateTopicFromVocab, 
  generateStudyItem 
} from './services/contentGen';
import { getTotalLocalItemsCount } from './services/localRepository';
import { StudySession } from './components/StudySession';
import { PracticeSession } from './components/PracticeSession';
import { ShadowingMode } from './components/ShadowingMode';
import { ConversationMode } from './components/ConversationMode';
import { ReviewList } from './components/ReviewList';
import { SettingsModal } from './components/SettingsModal';
import { DailyQuote } from './components/DailyQuote';

const fastClean = (text: string) => text.trim().toLowerCase().replace(/[.,!?;:]/g, '');

const getNextReviewInterval = (level: number) => {
  // Simple spaced repetition intervals
  const DAY = 24 * 60 * 60 * 1000;
  switch (level) {
    case 1: return DAY;
    case 2: return 3 * DAY;
    case 3: return 7 * DAY;
    case 4: return 14 * DAY;
    case 5: return 30 * DAY;
    default: return DAY;
  }
};

const App: React.FC = () => {
  const [mode, setMode] = useState<'dashboard' | 'study' | 'practice' | 'shadowing' | 'conversation' | 'review'>('dashboard');
  const [vocabList, setVocabList] = useState<VocabularyItem[]>(() => {
    try {
      const saved = localStorage.getItem('lingua_vocab');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const [dailyStats, setDailyStats] = useState<DailyStats>(() => {
    const today = new Date().toDateString();
    try {
      const saved = localStorage.getItem('lingua_stats');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.date === today) return parsed;
      }
    } catch {}
    return { date: today, itemsLearned: 0, itemsReviewed: 0, completedSpeaking: false };
  });

  const [studyItems, setStudyItems] = useState<StudyItem[]>([]);
  const [practiceExercises, setPracticeExercises] = useState<PracticeExercise[]>([]);
  const [currentPracticeItems, setCurrentPracticeItems] = useState<StudyItem[]>([]);
  const [conversationSession, setConversationSession] = useState<ConversationSession>({
    topic: '',
    history: [],
    targetWords: [],
    lastUpdated: 0
  });
  
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem('lingua_vocab', JSON.stringify(vocabList));
  }, [vocabList]);

  useEffect(() => {
    localStorage.setItem('lingua_stats', JSON.stringify(dailyStats));
  }, [dailyStats]);

  const handleStudyComplete = async (results: SessionResult[]) => {
    const now = Date.now();
    const newVocabList = [...vocabList];
    let learnedCount = 0;

    results.forEach(res => {
      const existingIndex = newVocabList.findIndex(v => v.id === res.item.id);
      if (existingIndex >= 0) {
        const currentLevel = newVocabList[existingIndex].masteryLevel;
        const newLevel = res.remembered ? Math.min(5, currentLevel + 1) : Math.max(1, currentLevel - 1);
        newVocabList[existingIndex] = {
          ...newVocabList[existingIndex],
          lastReviewed: now,
          nextReviewAt: now + getNextReviewInterval(newLevel),
          masteryLevel: newLevel,
          saved: res.item.saved
        };
      } else {
        if (res.remembered) {
           const newItem: VocabularyItem = {
             ...res.item,
             addedAt: now,
             lastReviewed: now,
             nextReviewAt: now + getNextReviewInterval(1),
             masteryLevel: 1
           };
           newVocabList.unshift(newItem);
           learnedCount++;
        }
      }
    });

    setVocabList(newVocabList);
    setDailyStats(prev => ({
      ...prev,
      itemsLearned: prev.itemsLearned + learnedCount
    }));

    setLoading(true);
    const exercises = await generatePracticeExercises(results.map(r => r.item));
    setLoading(false);
    
    if (exercises.length > 0) {
        setPracticeExercises(exercises);
        setCurrentPracticeItems(results.map(r => r.item));
        setMode('practice');
    } else {
        setMode('dashboard');
    }
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
                if (resWord === itemClean) {
                    isMatched = true;
                    isCorrect = correct;
                    break;
                }
                if (itemClean.includes(' ')) {
                    const parts = itemClean.split(/\s+/);
                    if (resWord.length > 1 && parts.includes(resWord)) {
                        isMatched = true;
                        isCorrect = correct;
                        break;
                    }
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
            const alreadyExists = updatedList.some(v => {
                const vText = fastClean(v.text);
                if (vText === wordClean) return true;
                if (vText.includes(' ') && vText.split(/\s+/).includes(wordClean)) return true;
                return false;
            });

            if (!alreadyExists) {
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

  const startDailyStudy = async () => {
    setLoading(true);
    const now = Date.now();
    const reviewItems = vocabList
        .filter(item => item.nextReviewAt <= now)
        .sort((a, b) => a.nextReviewAt - b.nextReviewAt)
        .slice(0, 5);
        
    const newItemsCount = Math.max(5, 10 - reviewItems.length);
    const newItems = await generateDailyContent(newItemsCount, vocabList);
    
    setStudyItems([...reviewItems, ...newItems]);
    setMode('study');
    setLoading(false);
  };

  const startConversation = async () => {
      setLoading(true);
      const targetWords = vocabList.slice(0, 3);
      const topic = targetWords.length > 0 
        ? await generateTopicFromVocab(targetWords)
        : await generateInitialTopic();
        
      setConversationSession({
          topic,
          history: [],
          targetWords,
          lastUpdated: Date.now()
      });
      setMode('conversation');
      setLoading(false);
  };

  const handleManualAdd = async (partialItem: any) => {
      setLoading(true);
      const fullItem = await generateStudyItem(partialItem.text);
      if (fullItem) {
          const newItem: VocabularyItem = {
              ...fullItem,
              addedAt: Date.now(),
              nextReviewAt: Date.now() + getNextReviewInterval(1),
              masteryLevel: 1,
              saved: true
          };
          setVocabList(prev => [newItem, ...prev]);
      }
      setLoading(false);
  };

  return (
    <div className="bg-slate-950 min-h-screen text-slate-200 font-sans selection:bg-indigo-500/30">
      <div className="max-w-md mx-auto h-screen bg-slate-950 relative shadow-2xl flex flex-col">
        
        {mode === 'dashboard' && (
            <div className="flex flex-col h-full p-6 overflow-y-auto custom-scrollbar">
                <header className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                            <BookOpen className="text-indigo-500" /> LinguaFlow
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">Daily Progress</p>
                    </div>
                    <button onClick={() => setShowSettings(true)} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                        <Settings size={20} />
                    </button>
                </header>

                <DailyQuote />

                <div className="grid grid-cols-2 gap-4 mb-8 mt-6">
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-emerald-400">{dailyStats.itemsLearned}</span>
                        <span className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Words Learned</span>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-blue-400">{dailyStats.itemsReviewed}</span>
                        <span className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Reviewed</span>
                    </div>
                </div>

                <div className="space-y-4 mb-8">
                    <button onClick={startDailyStudy} disabled={loading} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-3 transition-all active:scale-[0.98]">
                        {loading ? <Loader2 className="animate-spin" /> : <Brain size={20} />}
                        Start Daily Session
                    </button>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => setMode('shadowing')} className="py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-bold border border-slate-700 flex flex-col items-center justify-center gap-2 transition-all">
                            <Mic2 size={24} className="text-purple-400" />
                            <span className="text-sm">Shadowing</span>
                        </button>
                        <button onClick={startConversation} className="py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-bold border border-slate-700 flex flex-col items-center justify-center gap-2 transition-all">
                            <MessageSquare size={24} className="text-cyan-400" />
                            <span className="text-sm">Chat AI</span>
                        </button>
                    </div>

                    <button onClick={() => setMode('review')} className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-2xl font-medium border border-slate-800 flex items-center justify-center gap-2 transition-all">
                        <History size={18} /> Review History
                    </button>
                </div>
            </div>
        )}

        {mode === 'study' && (
            <StudySession 
                items={studyItems}
                initialIndex={0}
                onProgress={() => {}}
                onComplete={handleStudyComplete}
                onBack={() => setMode('dashboard')}
            />
        )}

        {mode === 'practice' && (
            <PracticeSession 
                exercises={practiceExercises}
                onComplete={handleExerciseComplete}
                onBack={() => setMode('dashboard')}
            />
        )}

        {mode === 'shadowing' && <ShadowingMode onBack={() => setMode('dashboard')} />}

        {mode === 'conversation' && (
            <ConversationMode 
                session={conversationSession}
                onUpdate={setConversationSession}
                onEndSession={() => setMode('dashboard')}
                onBack={() => setMode('dashboard')}
                onSaveVocab={(item) => handleManualAdd(item)}
            />
        )}

        {mode === 'review' && (
            <ReviewList 
                items={vocabList.filter(v => v.lastReviewed && new Date(v.lastReviewed).toDateString() === new Date().toDateString())}
                onBack={() => setMode('dashboard')}
            />
        )}

        <SettingsModal 
            show={showSettings} 
            onClose={() => setShowSettings(false)}
            vocabList={vocabList}
            dailyStats={dailyStats}
            onRestore={(data) => { setVocabList(data.vocabList); setDailyStats(data.dailyStats); }}
            totalRepoCount={getTotalLocalItemsCount()}
        />
      </div>
    </div>
  );
};

export default App;
