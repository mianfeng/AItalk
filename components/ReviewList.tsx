
import React, { useState } from 'react';
import { VocabularyItem } from '../types';
import { ArrowLeft, Volume2, Loader2 } from 'lucide-react';
import { useSpeech } from '../hooks/useSpeech';

interface ReviewListProps {
  items: VocabularyItem[];
  onBack: () => void;
}

export const ReviewList: React.FC<ReviewListProps> = ({ items, onBack }) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { speak, cancel } = useSpeech();

  const playTTS = (text: string, id: string) => {
    if (playingId === id) {
        cancel();
        setPlayingId(null);
        return;
    }
    
    setPlayingId(id);
    speak(text, 1.0, () => setPlayingId(null));
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200">
      {/* Header */}
      <div className="h-16 shrink-0 border-b border-slate-900 bg-slate-950 flex items-center px-4 sticky top-0 z-10">
        <button 
          onClick={onBack}
          className="mr-4 p-2 -ml-2 rounded-full hover:bg-slate-900 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-bold">今日回顾 ({items.length})</h2>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full pb-20 custom-scrollbar">
        {items.length === 0 ? (
          <div className="text-center text-slate-500 mt-20">
            <p>今天还没有学习记录哦。</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex gap-4">
                <button 
                  onClick={() => playTTS(item.text, item.id)}
                  className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors mt-1 ${playingId === item.id ? 'bg-slate-700 text-blue-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-400'}`}
                >
                  {playingId === item.id ? <Loader2 size={18} className="animate-spin" /> : <Volume2 size={18} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-slate-100 text-lg truncate pr-2">{item.text}</h3>
                    <span className="text-[10px] uppercase tracking-wider bg-slate-950 text-slate-500 px-2 py-0.5 rounded border border-slate-800">
                        {item.type}
                    </span>
                  </div>
                  <p className="text-emerald-400 text-sm font-medium mb-1">{item.translation}</p>
                  <p className="text-slate-500 text-xs line-clamp-2">{item.definition}</p>
                  
                  {item.extra_info && (
                      <p className="text-xs text-amber-500/80 mt-1">{item.extra_info}</p>
                  )}

                  <div className="mt-3 pt-3 border-t border-slate-800/50">
                    <p className="text-sm text-slate-400 italic">"{item.example}"</p>
                    {item.example_zh && <p className="text-xs text-slate-600 mt-1">{item.example_zh}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
