
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
  
  // Note: We use useSpeech for reading text, but Gemini's direct audio response is handled by playAudioFromBase64
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
        
        // 1. Analyze and get response text
        const result = await analyzeAudioResponse(base64Audio, session.topic, session.history);
        setAnalysis(result);
        
        // 2. Update History
        const newHistory = [...session.history, { 
            user: result.userTranscript, 
            ai: result.replyText 
        }];
        onUpdate({ ...session, history: newHistory });

        // 3. Generate and Play AI Audio
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
    <div className="flex flex-col h-full bg-slate-950 relative">
      {/* Header */}
      <div className="h-14 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md flex items-center justify-between px-4 sticky top-0 z-10 shrink-0">
         <div className="flex items-center gap-3 overflow-hidden">
             <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                 <X size={20} />
             </button>
             <div className="flex items-center gap-2 overflow-hidden">
                 <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                 <span className="font-bold text-slate-200 truncate text-sm">{session.topic}</span>
             </div>
         </div>
         <button onClick={() => setShowAnalysis(!showAnalysis)} className={`p-2 rounded-full transition-colors ${showAnalysis ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
             <Sparkles size={18} />
         </button>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {session.history.length === 0 && (
              <div className="flex flex-col items-center justify-center h-[50vh] text-slate-500 space-y-4 opacity-50">
                  <MessageSquare size={48} />
                  <p className="text-sm">点击麦克风开始第一句对话</p>
              </div>
          )}

          {session.history.map((turn, idx) => (
              <div key={idx} className="space-y-4">
                  {/* User Bubble */}
                  <div className="flex justify-end">
                      <div className="bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] shadow-lg relative group">
                          <p>{turn.user}</p>
                          <div className="absolute -left-8 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <User size={16} className="text-slate-500" />
                          </div>
                      </div>
                  </div>

                  {/* AI Bubble */}
                  <div className="flex justify-start">
                      <div className="bg-slate-800 border border-slate-700 text-slate-200 px-4 py-3 rounded-2xl rounded-tl-sm max-w-[90%] shadow-md group">
                          <p className="leading-relaxed">{turn.ai}</p>
                          <div className="mt-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => playReply(turn.ai)} className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors">
                                  <Volume2 size={16} />
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          ))}
          
          {analysis && showAnalysis && (
              <div className="bg-slate-900 border border-blue-500/30 rounded-2xl p-5 mt-4 animate-in slide-in-from-bottom-4 shadow-xl">
                  <div className="flex items-center gap-2 mb-3 text-blue-400 font-bold text-sm uppercase tracking-wider">
                      <Target size={16} /> 诊断建议
                  </div>
                  
                  <div className="space-y-4">
                      <div>
                          <div className="text-xs text-slate-500 mb-1">更地道的表达：</div>
                          <p className="text-emerald-400 font-medium text-sm bg-emerald-950/30 p-2 rounded-lg border border-emerald-500/20">{analysis.betterVersion}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <div className="text-xs text-slate-500 mb-1">发音建议：</div>
                              <p className="text-slate-300 text-xs">{analysis.pronunciation}</p>
                          </div>
                          <div>
                              <div className="text-xs text-slate-500 mb-1">综合评分：</div>
                              <div className="text-xl font-bold text-amber-400">{analysis.score}<span className="text-xs text-slate-600 font-normal">/100</span></div>
                          </div>
                      </div>

                      {analysis.chunks && analysis.chunks.length > 0 && (
                          <div>
                              <div className="text-xs text-slate-500 mb-2">推荐积累词汇：</div>
                              <div className="flex flex-wrap gap-2">
                                  {analysis.chunks.map((chunk, i) => (
                                      <button key={i} onClick={() => onSaveVocab({ text: chunk, type: 'word' })} className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300 transition-colors border border-slate-700 hover:border-blue-500/50">
                                          <PlusCircle size={12} /> {chunk}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          )}
          
          {/* Invisible Audio Element for User Playback */}
          <audio ref={userAudioRef} src={userAudioUrl || ''} onEnded={() => {}} className="hidden" />
          
          <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Control Bar */}
      <div className="p-4 bg-slate-950 border-t border-slate-900 shrink-0">
          <div className="flex items-center justify-center gap-6">
              {processingState === 'idle' ? (
                  <>
                    <button 
                        onClick={() => {
                            if (isRecording) handleStopRecording();
                            else startRecording();
                        }}
                        className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95 ${
                            isRecording 
                            ? 'bg-red-500 shadow-red-500/30' 
                            : 'bg-blue-600 shadow-blue-500/30'
                        }`}
                    >
                        {isRecording ? (
                            <div className="w-6 h-6 bg-white rounded-md animate-pulse" />
                        ) : (
                            <Mic size={28} className="text-white" />
                        )}
                    </button>
                    {userAudioUrl && !isRecording && (
                        <button onClick={() => userAudioRef.current?.play()} className="p-4 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                            <PlayCircle size={24} />
                        </button>
                    )}
                  </>
              ) : (
                  <div className="flex items-center gap-3 px-6 py-4 bg-slate-900 rounded-full border border-slate-800">
                      <Loader2 className="animate-spin text-blue-500" />
                      <span className="text-sm font-medium text-slate-400">
                          {processingState === 'analyzing' ? '正在分析语音...' : 'AI 正在回复...'}
                      </span>
                  </div>
              )}
          </div>
          <div className="text-center mt-3 text-xs text-slate-600 font-medium">
              {isRecording ? "点击停止并发送" : "点击麦克风开始说话"}
          </div>
      </div>
    </div>
  );
};
