import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, ArrowRight, RefreshCcw, Volume2, Sparkles, AlertCircle } from 'lucide-react';
import { analyzeAudioResponse, generateInitialTopic } from '../services/contentGen';
import { AnalysisResult } from '../types';

interface ConversationModeProps {
  onExit: () => void;
}

export const ConversationMode: React.FC<ConversationModeProps> = ({ onExit }) => {
  const [currentTopic, setCurrentTopic] = useState<string>("Loading...");
  const [history, setHistory] = useState<{user: string, ai: string}[]>([]);
  
  // States: idle -> recording -> processing -> reviewing -> idle
  const [state, setState] = useState<'idle' | 'recording' | 'processing' | 'reviewing'>('processing');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Init
  useEffect(() => {
    generateInitialTopic().then(topic => {
        setCurrentTopic(topic);
        setState('idle');
    });
  }, []);

  const playTTS = (text: string) => {
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = 'en-US';
    window.speechSynthesis.speak(speech);
  };

  const startRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunksRef.current.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            setState('processing');
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            
            // Convert to Base64
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
                const base64String = (reader.result as string).split(',')[1];
                
                // Call API
                const result = await analyzeAudioResponse(base64String, currentTopic, history);
                setAnalysis(result);
                setState('reviewing');
            };
            
            // Stop tracks
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setState('recording');
    } catch (e) {
        console.error("Mic error", e);
        alert("无法访问麦克风");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && state === 'recording') {
        mediaRecorderRef.current.stop();
    }
  };

  const handleContinue = () => {
    if (analysis) {
        // Add to history
        setHistory(prev => [...prev, { user: analysis.userTranscript, ai: currentTopic }]);
        
        // Update topic to the AI's reply
        setCurrentTopic(analysis.replyText);
        setAnalysis(null);
        setState('idle');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200 overflow-y-auto">
      
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-900 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="bg-blue-500/10 text-blue-400 p-1.5 rounded-lg"><Mic size={18} /></span>
            <span className="font-semibold">模拟对话练习</span>
          </div>
          <button onClick={onExit} className="text-slate-500 hover:text-slate-300 text-sm">结束练习</button>
      </div>

      <div className="flex-1 flex flex-col items-center p-6 max-w-3xl mx-auto w-full gap-8">
          
          {/* AI Topic Bubble */}
          <div className="w-full">
             <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-bold">AI 话题 / 问题</div>
             <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 relative">
                 <p className="text-xl md:text-2xl font-medium text-slate-100 pr-10 leading-relaxed">
                    {currentTopic}
                 </p>
                 <button 
                    onClick={() => playTTS(currentTopic)}
                    className="absolute right-4 top-4 p-2 text-slate-500 hover:text-blue-400 bg-slate-900/50 rounded-full transition-colors"
                 >
                     <Volume2 size={20} />
                 </button>
             </div>
          </div>

          {/* Recording Interface (Only visible when not reviewing) */}
          {state !== 'reviewing' && (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[200px]">
                  {state === 'processing' ? (
                      <div className="flex flex-col items-center gap-4 animate-pulse">
                          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                              <RefreshCcw className="animate-spin text-slate-400" />
                          </div>
                          <p className="text-slate-400 text-sm">正在分析你的口语...</p>
                      </div>
                  ) : (
                      <div className="flex flex-col items-center gap-6">
                          <div className={`relative transition-all duration-300 ${state === 'recording' ? 'scale-110' : 'scale-100'}`}>
                              {state === 'recording' && (
                                  <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-20"></div>
                              )}
                              <button
                                onClick={state === 'recording' ? stopRecording : startRecording}
                                className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-colors ${
                                    state === 'recording' 
                                    ? 'bg-red-500 text-white' 
                                    : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white hover:shadow-blue-500/25'
                                }`}
                              >
                                  {state === 'recording' ? <Square size={32} fill="currentColor" /> : <Mic size={32} />}
                              </button>
                          </div>
                          <p className="text-slate-500 text-sm font-medium">
                              {state === 'recording' ? '正在录音... 点击停止' : '点击开始回答'}
                          </p>
                      </div>
                  )}
              </div>
          )}

          {/* Analysis Result (Only visible when reviewing) */}
          {state === 'reviewing' && analysis && (
              <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                      
                      {/* Header Score */}
                      <div className="bg-slate-800/50 px-6 py-4 flex justify-between items-center border-b border-slate-800">
                          <div className="flex items-center gap-2">
                              <Sparkles size={18} className="text-amber-400" />
                              <span className="font-bold text-slate-200">口语分析报告</span>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                              analysis.score > 80 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'
                          }`}>
                              得分: {analysis.score}
                          </div>
                      </div>

                      <div className="p-6 space-y-6">
                          
                          {/* User Said */}
                          <div>
                              <div className="text-xs text-slate-500 mb-1">你说了:</div>
                              <p className="text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800/50">
                                  "{analysis.userTranscript}"
                              </p>
                          </div>

                          {/* Better Version */}
                          <div>
                              <div className="text-xs text-emerald-500 mb-1 font-bold flex items-center gap-1">
                                  <AlertCircle size={12} /> 地道表达:
                              </div>
                              <div className="flex items-start gap-3">
                                <p className="text-lg text-emerald-100 font-medium">
                                    {analysis.betterVersion}
                                </p>
                                <button onClick={() => playTTS(analysis.betterVersion)} className="mt-1 text-emerald-600 hover:text-emerald-400">
                                    <Volume2 size={16} />
                                </button>
                              </div>
                          </div>

                          {/* Analysis */}
                          <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-xl">
                              <p className="text-sm text-blue-200 leading-relaxed">
                                  💡 {analysis.analysis}
                              </p>
                          </div>

                      </div>

                      {/* Footer Action */}
                      <div className="p-4 bg-slate-950 border-t border-slate-900 flex justify-end">
                          <button 
                            onClick={handleContinue}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors"
                          >
                              继续对话 <ArrowRight size={18} />
                          </button>
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};
