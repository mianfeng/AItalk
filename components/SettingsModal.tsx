import React, { useRef, useState } from 'react';
import { X, Download, FileJson, FileSpreadsheet, Upload, AlertTriangle, CheckCircle, ArrowLeft, Volume2 } from 'lucide-react';
import { VocabularyItem, DailyStats, BackupData } from '../types';

interface SettingsModalProps {
  show: boolean;
  onClose: () => void;
  vocabList: VocabularyItem[];
  dailyStats: DailyStats;
  onRestore: (data: BackupData) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  show, 
  onClose, 
  vocabList, 
  dailyStats,
  onRestore
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [viewMode, setViewMode] = useState<'menu' | 'list'>('menu');

  if (!show) return null;

  // --- Export Logic ---

  const handleExportCSV = () => {
    // Header
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Type,Text,Translation,Definition,Example,Mastery Level,Added Date\n";

    // Rows
    vocabList.forEach(item => {
      const date = new Date(item.addedAt).toLocaleDateString();
      const row = [
        item.type,
        `"${item.text.replace(/"/g, '""')}"`, // Escape quotes
        `"${item.translation.replace(/"/g, '""')}"`,
        `"${item.definition.replace(/"/g, '""')}"`,
        `"${item.example.replace(/"/g, '""')}"`,
        item.masteryLevel,
        date
      ].join(",");
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `lingua_vocab_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    const backupData: BackupData = {
      vocabList,
      dailyStats,
      timestamp: Date.now(),
      version: 1
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `lingua_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Update last backup timestamp
    localStorage.setItem('lingua_last_backup', Date.now().toString());
  };

  // --- Import Logic ---

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const data = JSON.parse(json);

        // Simple validation
        if (Array.isArray(data.vocabList) && data.dailyStats) {
          if (confirm(`检测到备份文件。\n包含 ${data.vocabList.length} 个单词记录。\n\n确认要覆盖当前数据进行恢复吗？此操作不可撤销。`)) {
             onRestore(data as BackupData);
             setImportStatus('success');
             // Update backup timestamp since we just restored a valid state
             localStorage.setItem('lingua_last_backup', Date.now().toString());
             setTimeout(() => {
                 onClose();
                 setImportStatus('idle');
             }, 1500);
          }
        } else {
          throw new Error("Invalid format");
        }
      } catch (err) {
        console.error(err);
        setImportStatus('error');
        alert("文件格式错误，无法导入。请确保使用的是本应用导出的 JSON 备份文件。");
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again if needed
    event.target.value = '';
  };

  const playSimpleTTS = (text: string) => {
      const speech = new SpeechSynthesisUtterance(text);
      speech.lang = 'en-US';
      window.speechSynthesis.speak(speech);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden relative flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 shrink-0">
          <div className="flex items-center gap-3">
              {viewMode === 'list' && (
                  <button onClick={() => setViewMode('menu')} className="text-slate-400 hover:text-white">
                      <ArrowLeft size={20} />
                  </button>
              )}
              <h2 className="text-lg font-bold text-slate-100">{viewMode === 'list' ? '全部单词' : '数据管理'}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          
          {viewMode === 'menu' ? (
              <div className="space-y-6">
                {/* Stats Summary - CLICKABLE */}
                <button 
                    onClick={() => setViewMode('list')}
                    className="w-full bg-slate-800/50 hover:bg-slate-800 rounded-xl p-4 border border-slate-700 transition-colors text-left group"
                >
                    <div className="flex justify-between items-center">
                        <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">当前存储</div>
                        <ArrowLeft size={16} className="text-slate-600 rotate-180 group-hover:text-slate-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">{vocabList.length} <span className="text-base font-normal text-slate-400">个单词/句子</span></div>
                    <p className="text-[10px] text-slate-600 mt-2">点击查看列表</p>
                </button>

                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-400">导出数据 (备份)</h3>
                    <button 
                        onClick={handleExportJSON}
                        className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                <FileJson size={20} />
                            </div>
                            <div className="text-left">
                                <div className="font-medium text-slate-200">导出备份文件 (JSON)</div>
                                <div className="text-xs text-slate-500">包含完整数据的备份，用于恢复</div>
                            </div>
                        </div>
                        <Download size={18} className="text-slate-500 group-hover:text-white" />
                    </button>

                    <button 
                        onClick={handleExportCSV}
                        className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                <FileSpreadsheet size={20} />
                            </div>
                            <div className="text-left">
                                <div className="font-medium text-slate-200">导出单词表 (Excel/CSV)</div>
                                <div className="text-xs text-slate-500">用于导入 Anki 或打印复习</div>
                            </div>
                        </div>
                        <Download size={18} className="text-slate-500 group-hover:text-white" />
                    </button>
                </div>

                <div className="pt-4 border-t border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-400 mb-3">数据恢复</h3>
                    <input 
                        type="file" 
                        accept=".json" 
                        ref={fileInputRef} 
                        className="hidden" 
                        onChange={handleFileSelect}
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3 border border-dashed border-slate-600 rounded-xl text-slate-400 hover:text-white hover:border-slate-400 hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                        {importStatus === 'success' ? (
                            <span className="text-emerald-400 flex items-center gap-2"><CheckCircle size={16} /> 导入成功</span>
                        ) : (
                            <>
                                <Upload size={16} /> 从 JSON 备份文件恢复数据
                            </>
                        )}
                    </button>
                    <p className="text-[10px] text-slate-500 mt-2 text-center">
                        <AlertTriangle size={10} className="inline mr-1" />
                        导入将覆盖当前的学习进度，请谨慎操作。
                    </p>
                </div>
              </div>
          ) : (
              <div className="space-y-4">
                  {vocabList.length === 0 ? (
                      <p className="text-center text-slate-500 mt-10">暂无数据</p>
                  ) : (
                      vocabList.map(item => (
                          <div key={item.id} className="bg-slate-800/50 border border-slate-700 p-3 rounded-xl flex justify-between items-center">
                              <div>
                                  <div className="font-bold text-slate-200">{item.text}</div>
                                  <div className="text-xs text-slate-500">{item.translation}</div>
                              </div>
                              <button 
                                onClick={() => playSimpleTTS(item.text)}
                                className="p-2 text-slate-500 hover:text-white"
                              >
                                  <Volume2 size={16} />
                              </button>
                          </div>
                      ))
                  )}
              </div>
          )}
        </div>
      </div>
    </div>
  );
};