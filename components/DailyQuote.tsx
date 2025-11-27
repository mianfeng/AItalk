import React, { useEffect, useState } from 'react';
import { DailyQuoteItem } from '../types';
import { generateDailyQuote } from '../services/contentGen';
import { Quote, Loader2, Volume2 } from 'lucide-react';

export const DailyQuote: React.FC = () => {
  const [quote, setQuote] = useState<DailyQuoteItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check localStorage first
    const today = new Date().toDateString();
    const saved = localStorage.getItem('lingua_quote');
    
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.date === today) {
            setQuote(parsed.data);
            setLoading(false);
            return;
        }
    }

    generateDailyQuote().then(data => {
        setQuote(data);
        localStorage.setItem('lingua_quote', JSON.stringify({ date: today, data }));
        setLoading(false);
    });
  }, []);

  const playTTS = () => {
    if (!quote) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(quote.english);
    speech.lang = 'en-US';
    window.speechSynthesis.speak(speech);
  };

  if (loading) return (
      <div className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-6 flex justify-center py-10">
          <Loader2 className="animate-spin text-slate-600" />
      </div>
  );

  if (!quote) return null;

  return (
    <div className="w-full bg-gradient-to-r from-amber-900/10 to-slate-900 border border-amber-900/30 rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
            <Quote size={64} className="text-amber-500" />
        </div>
        
        <div className="relative z-10">
            <h3 className="text-amber-500 text-xs font-bold tracking-widest uppercase mb-3 flex items-center gap-2">
                <Quote size={14} /> 每日金句
            </h3>
            
            <div className="flex items-start gap-3 mb-2">
                 <p className="text-xl font-serif text-slate-100 leading-relaxed italic">
                    "{quote.english}"
                 </p>
                 <button onClick={playTTS} className="mt-1 text-slate-500 hover:text-amber-400 transition-colors">
                     <Volume2 size={18} />
                 </button>
            </div>
            
            <p className="text-slate-400 text-sm mb-4">{quote.chinese}</p>
            
            <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
                <span className="w-8 h-[1px] bg-slate-700 inline-block"></span>
                {quote.source}
            </div>
        </div>
    </div>
  );
};
