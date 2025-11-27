import React from 'react';
import { Message } from '../types';
import { BookMarked, User, Bot, PlusCircle, Sparkles, ArrowRight } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  onSaveVocab: (text: string, type: 'word' | 'sentence') => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onSaveVocab }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex flex-col mb-6 ${isUser ? 'items-end' : 'items-start'}`}>
      
      {/* Feedback Card (If present, usually attached to model message answering user, or we can render it standalone if we attach to user message. 
          Ideally, feedback is about the PREVIOUS user turn. 
          If this message HAS feedback attached, render it FIRST or LAST? 
          Let's assume the feedback is attached to the MODEL's turn regarding the USER's previous input. 
      */}
      {message.role === 'model' && message.feedback && (
          <div className="mb-4 w-full max-w-md bg-gradient-to-br from-slate-900 to-slate-800 border border-amber-500/30 rounded-xl p-4 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex items-center gap-2 mb-3 text-amber-400">
                 <Sparkles size={16} />
                 <span className="text-xs font-bold uppercase tracking-wider">AI 优化建议</span>
             </div>
             
             <div className="space-y-4">
                 <div>
                     <p className="text-xs text-slate-500 mb-1">你的表达</p>
                     <p className="text-slate-400 text-sm line-through decoration-red-500/50">{message.feedback.original}</p>
                 </div>
                 
                 <div>
                     <p className="text-xs text-slate-500 mb-1">地道表达</p>
                     <p className="text-emerald-300 text-base font-medium">{message.feedback.better}</p>
                 </div>

                 <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                     <p className="text-xs text-slate-400 leading-relaxed">{message.feedback.analysis}</p>
                 </div>

                 {message.feedback.chunks.length > 0 && (
                     <div className="flex flex-wrap gap-2 mt-2">
                         {message.feedback.chunks.map((chunk, i) => (
                             <button 
                                key={i}
                                onClick={() => onSaveVocab(chunk, 'word')}
                                className="text-xs flex items-center gap-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1.5 rounded-md transition-colors"
                             >
                                 <PlusCircle size={10} />
                                 {chunk}
                             </button>
                         ))}
                     </div>
                 )}
             </div>
          </div>
      )}

      {/* Main Message Bubble */}
      <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
            {isUser ? <User size={20} className="text-white" /> : <Bot size={20} className="text-white" />}
        </div>
        
        <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
            <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser 
                ? 'bg-indigo-500/10 text-indigo-100 border border-indigo-500/20 rounded-tr-none' 
                : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-none'
            }`}>
            {message.text}
            </div>
            
            {/* Action Buttons for Normal Messages */}
            {!isUser && (
                <div className="flex gap-2 mt-2">
                    <button 
                        onClick={() => {
                            const selection = window.getSelection()?.toString();
                            if(selection && selection.length > 0) {
                                onSaveVocab(selection, 'word');
                            } else {
                                alert("请先选中一个单词！");
                            }
                        }}
                        className="text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors bg-slate-800/50 px-2 py-1 rounded"
                    >
                        <BookMarked size={12} />
                        <span>选中保存</span>
                    </button>
                </div>
            )}
        </div>
      </div>

    </div>
  );
};