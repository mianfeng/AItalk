import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, ArrowRight, RefreshCcw, Volume2, Sparkles, AlertCircle, Loader2, PlayCircle, PlusCircle, Check, RotateCcw, Target, X, Save } from 'lucide-react';
import { analyzeAudioResponse, generateSpeech } from '../services/contentGen';
import { playAudioFromBase64 } from '../services/audioUtils';
import { AnalysisResult, ItemType, VocabularyItem, ConversationSession } from '../types';

interface ConversationModeProps {
  session: ConversationSession;
  onUpdate: (session: ConversationSession) => void;
  onEndSession: () => void;
  onBack: () => void;
  onSaveVocab: (text: string, type: ItemType) => void;
}

export const ConversationMode: React.FC<ConversationModeProps> = ({ session, onUpdate, onEndSession, onBack, onSaveVocab }) => {
  const [currentTopic, setCurrentTopic] = useState<string>(session.topic);
  const [history, setHistory] = useState<{user: string, ai: string}[]>(session.history || []);
  
  // Use session.targetWords
  const targetWords = session.targetWords;

  // States: idle -> recording -> processing -> reviewing -> idle
  const [state, setState] = useState<'idle' | 'recording' | 'processing' | 'reviewing'>('idle');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  
  // Stores the "Better Version" from the PREVIOUS attempt when "Try Again" is clicked
  const [lastBetterVersion, setLastBetterVersion] = useState<string | null>(null);

  const [playingId, setPlayingId] = useState<string | null>(null); // 'topic' or 'better'
  
  // User Audio State
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
  const userAudioRef = useRef<HTMLAudioElement>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Audio Cache
  const audioCache = useRef<Map<string, string>>(new Map());

  // Check if topic updated in props (shouldn't really happen inside this view, but good safety)
  useEffect(() => {
      setCurrentTopic(session.topic);
      setHistory(session.history || []);
  }, [session.topic, session.history]);

  // Update parent whenever history changes
  const updateHistory = (newHistory: {user: string, ai: string}[], newTopic: string) => {
      setHistory(newHistory);
      setCurrentTopic(newTopic);
      onUpdate({
          ...session,
          history: newHistory,
          topic: newTopic,
          lastUpdated: Date.now()
      });
  };

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
        if (userAudioUrl) URL.revokeObjectURL(userAudioUrl);
        audioCache.current.clear();
    };
  }, []);

  const playTTS = async (text: string, id: string) => {
    if (playingId) return;
    setPlayingId(id);
    try {
        if (audioCache.current.has(text)) {
            await playAudioFromBase64(audioCache.current.get(text)!);
        } else {
            // Try Gemini TTS first for quality
            const base64 = await generateSpeech(text);
            if (base64) {
                audioCache.current.set(text, base64);
                await playAudioFromBase64(base64);
            } else {
                // Fallback to browser TTS (Faster/Offline)
                const speech = new SpeechSynthesisUtterance(text);
                speech.lang = 'en-US';
                window.speechSynthesis.speak(speech);
            }
        }
    } catch (e) {
        console.error(e);
        // Fallback safety
        const speech = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(speech);
    } finally {
        setPlayingId(null);
    }
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
            
            // Create playable URL for user review
            const audioUrl = URL.createObjectURL(audioBlob);
            setUserAudioUrl(audioUrl);

            // Convert to Base64 for API
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
        alert("无法访问麦克风，请检查权限。");
        setState('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
    }
  };

  const handleContinue = () => {
    if (analysis) {
        const newHistory = [...history, { user: analysis.userTranscript, ai: currentTopic }];
        updateHistory(newHistory, analysis.replyText);
        
        setAnalysis(null);
        setLastBetterVersion(null); 
        if (userAudioUrl) URL.revokeObjectURL(userAudioUrl);
        setUserAudioUrl(null);
        setState('idle');
    }
  };

  const handleTryAgain = () => {
      // Save the better version so the user can see it while recording again
      if (analysis?.betterVersion) {
          setLastBetterVersion(analysis.betterVersion);
      }
      
      // Clear analysis and audio, go back to idle to record again for the SAME topic
      setAnalysis(null);
      if (userAudioUrl) URL.revokeObjectURL(userAudioUrl);
      setUserAudioUrl(null);
      setState('idle');
  };

  const playUserAudio = () => {
      if (userAudioRef.current) {
          userAudioRef.current.currentTime = 0;
          userAudioRef.current.play();
      }
  };

  const [savedChunks, setSavedChunks] = useState<Set<string>>(new Set());

  const handleSaveChunk = (text: string) => {
      onSaveVocab(text, 'word'); 
      setSavedChunks(prev => new Set(prev).add(text));
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200 overflow-y-auto">
      
      {/* Header */}
      <div className="px-4 py-3 shrink-0 border-b border-slate-900 bg-slate-950 sticky top-0 z-10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-900 text-slate-400 hover:text-white transition-colors">
                <ArrowRight className="rotate-180" size={20} />
            </button>
            <div className="flex flex-col">
                <span className="font-semibold text-sm">模拟对话练习</span>
                <span className="text-[10px] text-slate-500">进度自动保存</span>
            </div>
          </div>
          <button 
            onClick={onEndSession} 
            className="text-red-400 hover:text-red-300 text-xs bg-red-900/10 px-3 py-1.5 rounded-full border border-red-900/20 flex items-center gap-1 transition-colors"
          >
              <X size={14} /> 结束话题
          </button>
      </div>

      <div className="flex-1 flex flex-col items-center p-4 max-w-3xl mx-auto w-full gap-6 pb-20">
          
          {/* Target Vocabulary Display */}
          {targetWords.length > 0 && (
              <div className="w-full bg-slate-900/50 border border-indigo-500/20 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2 text-indigo-400 text-xs font-bold uppercase tracking-wide">
                      <Target size={14} /> 本轮目标词汇
                  </div>
                  <div className="flex flex-wrap gap-2">
                      {targetWords.map((item, i) => (
                          <div key={i} className={`px-2 py-1 rounded text-xs flex items-center gap-2 border ${item.type === 'word' ? 'bg-slate-950 border-slate-800' : 'bg-indigo-950/30 border-indigo-500/20'}`}>
                              <span className="text-slate-200 font-medium">{item.text}</span>
                              <span className="text-slate-500 border-l border-slate-800 pl-2">{item.translation}</span>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {/* AI Topic Bubble */}
          <div className="w-full">
             <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider font-bold flex justify-between">
                 <span>AI 话题 / 问题</span>
                 {history.length > 0 && <span className="text-slate-600">已对话 {history.length} 轮</span>}
             </div>
             <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 relative">
                 <p className="text-lg md:text-xl font-medium text-slate-100 pr-10 leading-relaxed">
                    {currentTopic}
                 </p>
                 <button 
                    onClick={() => playTTS(currentTopic, 'topic')}
                    disabled={!!playingId}
                    className="absolute right-4 top-4 p-2 text-slate-500 hover:text-blue-400 bg-slate-900/50 rounded-full transition-colors disabled:opacity-50"
                 >
                     {playingId === 'topic' ? <Loader2 size={20} className="animate-spin" /> : <Volume2 size={20} />}
                 </button>
             </div>
          </div>

          {/* Recording Interface (Only visible when not reviewing) */}
          {state !== 'reviewing' && (
              <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] w-full">
                  
                  {/* Previous Advice (Visible during Retry) */}
                  {lastBetterVersion && state === 'idle' && (
                      <div className="mb-6 w-full max-w-md bg-emerald-900/20 border border-emerald-500/20 p-4 rounded-xl animate-in fade-in slide-in-from-top-2">
                          <div className="text-emerald-500 text-xs font-bold mb-2 flex items-center gap-1">
                              <Sparkles size={12} /> 参考表达 (建议照着读)
                          </div>
                          <p className="text-emerald-100/90 text-sm leading-relaxed">{lastBetterVersion}</p>
                          <button 
                            onClick={() => playTTS(lastBetterVersion, 'prev_better')}
                            disabled={!!playingId}
                            className="mt-2 text-xs flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
                           >
                              <Volume2 size={12} /> 播放示范
                          </button>
                      </div>
                  )}

                  {state === 'processing' ? (
                      <div className="flex flex-col items-center gap-4 animate-pulse">
                          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                              <RefreshCcw className="animate-spin text-slate-400" />
                          </div>
                          <p className="text-slate-400 text-sm">正在分析...</p>
                      </div>
                  ) : (
                      <div className="flex flex-col items-center gap-6">
                          <div className={`relative transition-all duration-300 ${state === 'recording' ? 'scale-110' : 'scale-100'}`}>
                              {state === 'recording' && (
                                  <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-20 pointer-events-none"></div>
                              )}
                              <button
                                onClick={state === 'recording' ? stopRecording : startRecording}
                                className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-colors relative z-10 ${
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
              <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
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

                      <div className="p-6 space-y-8">
                          
                          {/* User Said & Playback */}
                          <div>
                              <div className="text-xs text-slate-500 mb-2 flex justify-between items-center">
                                  <span>你的录音</span>
                                  {userAudioUrl && (
                                      <button 
                                        onClick={playUserAudio}
                                        className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-[10px]"
                                      >
                                          <PlayCircle size={12} /> 重听原音
                                      </button>
                                  )}
                              </div>
                              <p className="text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800/50 italic mb-2">
                                  "{analysis.userTranscript}"
                              </p>
                              {userAudioUrl && (
                                  <audio ref={userAudioRef} src={userAudioUrl} className="hidden" />
                              )}
                              
                              {/* Pronunciation Feedback */}
                              <div className="mt-3 bg-purple-500/5 border border-purple-500/20 p-3 rounded-lg">
                                  <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider mb-1">发音与语调</div>
                                  <p className="text-sm text-purple-200/80 leading-relaxed">{analysis.pronunciation}</p>
                              </div>
                          </div>

                          {/* Better Version */}
                          <div>
                              <div className="text-xs text-emerald-500 mb-2 font-bold flex items-center gap-1">
                                  <AlertCircle size={12} /> 地道改写
                              </div>
                              <div className="flex items-start gap-3 mb-3">
                                <p className="text-lg text-emerald-100 font-medium">
                                    {analysis.betterVersion}
                                </p>
                                <button 
                                    onClick={() => playTTS(analysis.betterVersion, 'better')}
                                    disabled={!!playingId}
                                    className="mt-1 text-emerald-600 hover:text-emerald-400 disabled:opacity-50 shrink-0"
                                >
                                    {playingId === 'better' ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={16} />}
                                </button>
                              </div>

                              {/* Chunks */}
                              {analysis.chunks && analysis.chunks.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                      {analysis.chunks.map((chunk, idx) => (
                                          <button
                                            key={idx}
                                            onClick={() => handleSaveChunk(chunk)}
                                            disabled={savedChunks.has(chunk)}
                                            className={`text-xs flex items-center gap-1 px-2 py-1.5 rounded-md border transition-colors ${
                                                savedChunks.has(chunk)
                                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                            }`}
                                          >
                                              {savedChunks.has(chunk) ? <Check size={10} /> : <PlusCircle size={10} />}
                                              {chunk}
                                          </button>
                                      ))}
                                  </div>
                              )}
                          </div>

                          {/* Grammar Analysis */}
                          <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-xl">
                              <p className="text-sm text-blue-200 leading-relaxed">
                                  💡 {analysis.analysis}
                              </p>
                          </div>

                      </div>

                      {/* Footer Action */}
                      <div className="p-4 bg-slate-950 border-t border-slate-900 flex justify-between items-center">
                          <button
                            onClick={handleTryAgain}
                            className="text-slate-400 hover:text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors hover:bg-slate-900"
                          >
                              <RotateCcw size={16} /> 再试一次
                          </button>
                          
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