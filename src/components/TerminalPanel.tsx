import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Send, RefreshCw, Trash2, Cpu, Database, Activity, Globe } from 'lucide-react';
import { adminApi } from '../lib/adminApi';

interface TerminalLine {
  type: 'cmd' | 'out' | 'err';
  text: string;
  timestamp: string;
}

export const TerminalPanel: React.FC = () => {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [isRemote, setIsRemote] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Начальное приветствие
    addLine('out', 'Selin AI Sovereign Core Terminal v2.1 initialized.');
    addLine('out', 'Ready for secure operations.');
    
    // Проверка статуса при загрузке
    const checkStatus = async () => {
      try {
        const res = await adminApi('/api/admin/terminal/status');
        if (res.ok) {
          const data = await res.json();
          setIsRemote(data.configured);
        } else {
          setIsRemote(false);
        }
      } catch (e) {
        setIsRemote(false);
      }
    };
    checkStatus();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const addLine = (type: 'cmd' | 'out' | 'err', text: string) => {
    setLines(prev => [...prev, {
      type,
      text,
      timestamp: new Date().toLocaleTimeString('ru-RU')
    }].slice(-100));
  };

  const executeCommand = async (cmd: string) => {
    if (!cmd.trim() || isExecuting) return;
    
    setIsExecuting(true);
    addLine('cmd', `selin@vm:~$ ${cmd}`);
    
    try {
      const res = await adminApi('/api/admin/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      
      const data = await res.json();
      
      if (data.remote !== undefined) setIsRemote(data.remote);

      if (data.stdout) addLine('out', data.stdout);
      if (data.stderr) addLine('err', data.stderr);
      if (!data.stdout && !data.stderr && !data.error) addLine('out', '(Done, no output)');
      if (data.error) addLine('err', `Error: ${data.error}`);
      
    } catch (err: any) {
      addLine('err', `Network error: ${err.message}`);
    } finally {
      setIsExecuting(false);
      setInput('');
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeCommand(input);
  };

  const quickCommands = [
    { label: 'Uptime', cmd: 'uptime', icon: <Activity className="w-3 h-3" /> },
    { label: 'Memory', cmd: 'free -m', icon: <Cpu className="w-3 h-3" /> },
    { label: 'Docker', cmd: 'docker ps', icon: <Database className="w-3 h-3" /> },
    { label: 'Ollama', cmd: 'ollama list', icon: <RefreshCw className="w-3 h-3" /> },
    { label: 'App Logs', cmd: 'tail -n 50 logs/app.log', icon: <TerminalIcon className="w-3 h-3" /> },
    { label: 'Check Net', cmd: 'ping -c 4 google.com', icon: <Globe className="w-3 h-3 text-blue-400" /> },
    { label: 'Update Core', cmd: 'cd /services/selin-ai && sudo git pull origin main && sudo docker compose build --no-cache selin-ai && sudo docker compose up -d selin-ai', icon: <RefreshCw className="w-3 h-3 text-emerald-400" /> },
  ];

  return (
    <div className="flex flex-col h-[600px] bg-[#0F0D0C] border border-[#2A231F] rounded-2xl overflow-hidden shadow-2xl">
      {/* Terminal Header */}
      <div className="bg-[#1C1715] px-4 py-3 border-b border-[#2A231F] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-[#C5A059]" />
          <h3 className="text-xs font-bold text-[#EAE6DF] uppercase tracking-wider flex items-center gap-2">
            Терминал Ядра СВМ
            {isRemote !== null && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${isRemote ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                {isRemote ? 'SSH: 176.108.252.111' : 'Local Mode'}
              </span>
            )}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setLines([])}
            className="p-1.5 rounded-lg text-[#9E958C] hover:text-red-400 hover:bg-red-400/10 transition-all"
            title="Очистить терминал"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed custom-scrollbar bg-black/40"
      >
        {lines.length === 0 && (
          <div className="text-[#5A524A] italic">
            Ядро Selin AI готово к приему системных команд...
          </div>
        )}
        {lines.map((line, idx) => (
          <div key={idx} className="mb-1 animate-fade-in whitespace-pre-wrap break-words">
            <span className="text-[#5A524A] mr-2">[{line.timestamp}]</span>
            {line.type === 'cmd' && <span className="text-[#C5A059] font-bold">{line.text}</span>}
            {line.type === 'out' && <span className="text-[#EAE6DF]">{line.text}</span>}
            {line.type === 'err' && <span className="text-red-400 font-medium">{line.text}</span>}
          </div>
        ))}
        {isExecuting && (
          <div className="text-[#C5A059] animate-pulse">_</div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-[#1C1715]/50 px-4 py-2 border-t border-[#2A231F] flex flex-wrap gap-2">
        {quickCommands.map((q, idx) => (
          <button
            key={idx}
            onClick={() => executeCommand(q.cmd)}
            disabled={isExecuting}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#26201D] border border-[#382F2A] text-[10px] font-medium text-[#9E958C] hover:text-[#C5A059] hover:border-[#C5A059]/50 transition-all disabled:opacity-50"
          >
            {q.icon}
            {q.label}
          </button>
        ))}
      </div>

      {/* Terminal Input */}
      <form onSubmit={handleFormSubmit} className="bg-[#1C1715] p-3 flex items-center gap-3">
        <div className="text-[#C5A059] font-mono font-bold text-xs">$</div>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Введите системную команду..."
          disabled={isExecuting}
          className="flex-1 bg-transparent border-none text-[#EAE6DF] font-mono text-xs focus:ring-0 placeholder-[#5A524A]"
          autoFocus
        />
        <button
          type="submit"
          disabled={isExecuting || !input.trim()}
          className="p-2 rounded-lg bg-[#C5A059] text-[#0F0D0C] hover:bg-[#D4B06A] transition-all disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
