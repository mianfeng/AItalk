
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, ArrowRight, RefreshCcw, Volume2, Sparkles, AlertCircle, Loader2, PlayCircle, PlusCircle, Check, RotateCcw, Target, X, Save, MessageSquare, MapPin, User } from 'lucide-react';
import { analyzeAudioResponse, generateSpeech } from '../services/contentGen';
import { playAudioFromBase64 } from '../services/audioUtils';
import { AnalysisResult, ItemType, ConversationSession } from '../types';
import { useSpeech } from '../hooks/useSpeech';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

interface ConversationModeProps {
  session: ConversationSession;
  onUpdate: (session: ConversationSession) => void;
  onEndSession: () => void;
  onBack: () => void;
  onSaveVocab: (item: any) => void;
}

export const ConversationMode: React.FC<ConversationModeProps> = ({ session, onUpdate, onEndSession, onBack, onSaveVocab }) => {
  const [processingState, setProcessingState] = useState<'idle' | 'analyzing' | 'speaking'>('idle');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  
  // Audio Hooks
  const { isRecording, startRecording, stopRecording, audioUrl: userAudioUrl } = useAudioRecorder();
  
  const { speak, isPlaying: isTTSPlaying, cancel: cancelTTS } = useSpeech();

  const userAudioRef = useRef<HTMLAudioElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [session.history, analysis]);

  const handleStopRecording = async () => {
    setProcessingState('analyzing');
    try {
        const base64Audio = await stopRecording();
        
        const result = await analyzeAudioResponse(base64Audio, session.topic, session.history);
        setAnalysis(result);
        
        const newHistory = [...session.history, { 
            user: result.userTranscript, 
            ai: result.replyText 
        }];
        onUpdate({ ...session, history: newHistory });

        setProcessingState('speaking');
        const speechBase64 = await generateSpeech(result.replyText);
        setProcessingState('idle');
        
        if (speechBase64) {
            await playAudioFromBase64(speechBase64);
        }
        
    } catch (e) {
        console.error(e);
        alert("处理对话时出错，请重试");
        setProcessingState('idle');
    }
  };

  const playReply = async (text: string) => {
      if (processingState === 'speaking') return;
      setProcessingState('speaking');
      try {
          const speechBase64 = await generateSpeech(text);
          if (speechBase64) {
              await playAudioFromBase64(speechBase64);
          }
      } catch(e) {
          console.error(e);
      } finally {
          setProcessingState('idle');
      }
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Glass Header */}
      <div className="h-16 shrink-0 border-b border-white/5 bg-slate-900/60 backdrop-blur-xl flex items-center justify-between px-4 sticky top-0 z-10">
         <div className="flex items-center gap-3 overflow-hidden">
             <button onClick={onBack} className="p-2 -ml-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
                 <X size={20} />
             </button>
             <div className="flex items-center gap-2 overflow-hidden">
                 <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                 <span className="font-bold text-slate-100 truncate text-sm">{session.topic}</span>
             </div>
         </div>
         <button onClick={() => setShowAnalysis(!showAnalysis)} className={`p-2 rounded-full transition-all ${showAnalysis ? 'bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'bg-slate-800/50 text-slate-400 border border-white/5'}`}>
             <Sparkles size={18} />
         </button>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {session.history.length === 0 && (
              <div className="flex flex-col items-center justify-center h-[50vh] text-slate-600 space-y-4">
                  <div className="p-6 bg-white/5 rounded-full border border-white/5">
                    <MessageSquare size={40} className="text-slate-500" />
                  </div>
                  <p className="text-sm font-medium">点击下方麦克风开始第一句对话</p>
              </div>
          )}

          {session.history.map((turn, idx) => (
              <div key={idx} className="space-y-4">
                  {/* User Bubble - Vibrant Gradient */}
                  <div className="flex justify-end">
                      <div className="bg-gradient-to-br from-cyan-600 to-blue-600 text-white px-5 py-3 rounded-2xl rounded-tr-sm max-w-[85%] shadow-lg relative group border border-white/10">
                          <p>{turn.user}</p>
                          <div className="absolute -left-8 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <User size={16} className="text-slate-600" />
                          </div>
                      </div>
                  </div>

                  {/* AI Bubble - Glass */}
                  <div className="flex justify-start">
                      <div className="bg-slate-800/60 backdrop-blur-md border border-white/5 text-slate-200 px-5 py-3 rounded-2xl rounded-tl-sm max-w-[90%] shadow-md group">
                          <p className="leading-relaxed">{turn.ai}</p>
                          <div className="mt-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => playReply(turn.ai)} className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-cyan-400 transition-colors">
                                  <Volume2 size={16} />
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          ))}
          
          {analysis && showAnalysis && (
              <div className="glass-card border-l-4 border-l-cyan-500 rounded-r-2xl p-5 mt-4 animate-in slide-in-from-bottom-4 shadow-xl mx-2">
                  <div className="flex items-center gap-2 mb-4 text-cyan-400 font-bold text-sm uppercase tracking-wider">
                      <Target size={16} /> 诊断建议
                  </div>
                  
                  <div className="space-y-4">
                      <div>
                          <div className="text-xs text-slate-500 mb-1 font-bold">更地道的表达</div>
                          <p className="text-emerald-300 font-medium text-sm bg-emerald-900/20 p-3 rounded-xl border border-emerald-500/20">{analysis.betterVersion}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <div className="text-xs text-slate-500 mb-1 font-bold">发音建议</div>
                              <p className="text-slate-300 text-xs leading-relaxed">{analysis.pronunciation}</p>
                          </div>
                          <div>
                              <div className="text-xs text-slate-500 mb-1 font-bold">综合评分</div>
                              <div className="text-2xl font-black text-amber-400">{analysis.score}<span className="text-xs text-slate-600 font-normal ml-1">/100</span></div>
                          </div>
                      </div>

                      {analysis.chunks && analysis.chunks.length > 0 && (
                          <div>
                              <div className="text-xs text-slate-500 mb-2 font-bold">推荐积累词汇</div>
                              <div className="flex flex-wrap gap-2">
                                  {analysis.chunks.map((chunk, i) => (
                                      <button key={i} onClick={() => onSaveVocab({ text: chunk, type: 'word' })} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-cyan-900/30 rounded-lg text-xs text-slate-300 transition-colors border border-white/5 hover:border-cyan-500/30">
                                          <PlusCircle size={12} /> {chunk}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          )}
          
          <audio ref={userAudioRef} src={userAudioUrl || ''} onEnded={() => {}} className="hidden" />
          
          <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Control Bar */}
      <div className="p-6 bg-slate-900/80 backdrop-blur-xl border-t border-white/5 shrink-0 pb-8">
          <div className="flex items-center justify-center gap-8">
              {processingState === 'idle' ? (
                  <>
                    <button 
                        onClick={() => {
                            if (isRecording) handleStopRecording();
                            else startRecording();
                        }}
                        className={`w-18 h-18 p-5 rounded-full flex items-center justify-center transition-all shadow-[0_0_30px_-5px_rgba(0,0,0,0.5)] hover:scale-105 active:scale-95 ${
                            isRecording 
                            ? 'bg-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)] animate-pulse' 
                            : 'bg-gradient-to-r from-cyan-500 to-blue-600 shadow-[0_0_20px_rgba(6,182,212,0.3)]'
                        }`}
                    >
                        {isRecording ? (
                            <div className="w-8 h-8 bg-white rounded-md" />
                        ) : (
                            <Mic size={32} className="text-white" />
                        )}
                    </button>
                    {userAudioUrl && !isRecording && (
                        <button onClick={() => userAudioRef.current?.play()} className="p-4 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors border border-white/5">
                            <PlayCircle size={28} />
                        </button>
                    )}
                  </>
              ) : (
                  <div className="flex items-center gap-4 px-8 py-4 bg-slate-800 rounded-full border border-white/5 shadow-lg">
                      <Loader2 className="animate-spin text-cyan-400" size={24} />
                      <span className="text-sm font-bold text-slate-300">
                          {processingState === 'analyzing' ? '正在分析语音...' : 'AI 正在回复...'}
                      </span>
                  </div>
              )}
          </div>
          <div className="text-center mt-4 text-xs text-slate-500 font-medium tracking-wide">
              {isRecording ? "点击停止发送" : "点击麦克风开始说话"}
          </div>
      </div>
    </div>
  );
};
