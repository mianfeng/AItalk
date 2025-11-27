import React from 'react';
import { Message } from '../types';
import { BookMarked, User, Bot, PlusCircle } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  onSaveVocab: (text: string, type: 'word' | 'sentence') => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onSaveVocab }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex gap-3 mb-6 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
        {isUser ? <User size={20} className="text-white" /> : <Bot size={20} className="text-white" />}
      </div>
      
      <div className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isUser 
            ? 'bg-indigo-500/10 text-indigo-100 border border-indigo-500/20 rounded-tr-none' 
            : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-none'
        }`}>
          {message.text}
        </div>
        
        {!isUser && (
           <div className="flex gap-2 mt-2">
               <button 
                 onClick={() => {
                    const selection = window.getSelection()?.toString();
                    if(selection && selection.length > 0) {
                        onSaveVocab(selection, 'word');
                    } else {
                        // If nothing selected, hint the user or save the first word? 
                        // Actually, let's just save the selection if it exists.
                        alert("请先选中一个单词！");
                    }
                 }}
                 className="text-xs flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors bg-slate-800/50 px-2 py-1 rounded"
               >
                 <BookMarked size={12} />
                 <span>保存单词</span>
               </button>

               <button 
                 onClick={() => onSaveVocab(message.text, 'sentence')}
                 className="text-xs flex items-center gap-1 text-slate-400 hover:text-blue-400 transition-colors bg-slate-800/50 px-2 py-1 rounded"
               >
                 <PlusCircle size={12} />
                 <span>保存句子</span>
               </button>
           </div>
        )}
      </div>
    </div>
  );
};