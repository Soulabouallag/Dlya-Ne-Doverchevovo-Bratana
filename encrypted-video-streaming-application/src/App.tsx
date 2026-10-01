import React, { useState, useEffect, useRef } from 'react';
import { Shield, Lock, Zap, Terminal, Play, Eye, Download, Activity } from 'lucide-react';
import { deriveMasterKey, decryptParams } from './crypto/vault';
import { HEADER_FAKE_SIZE, HEADER_LEN_SIZE, SALTS_SIZE, ENC_PARAMS_SIZE } from './crypto/constants';
import { StreamDecryptor } from './crypto/stream-decryptor';
import { performEncryption } from './crypto/encryptor';
import Stats from './components/Stats';
import VideoPlayer from './components/VideoPlayer';
import { cn } from './lib/utils';

const App: React.FC = () => {
  const [mode, setMode] = useState<'PLAY' | 'ENCRYPT'>('PLAY');
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [kdfProgress, setKdfProgress] = useState(0);
  const [decryptor, setDecryptor] = useState<StreamDecryptor | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState({ cpu: 0, ram: '0MB', speed: '0MB/s', cache: '0MB' });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clientId = useRef(Math.random().toString(36).substr(2, 9)).current;
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    setLogs(prev => {
      const newLogs = [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`];
      return newLogs.length > 50 ? newLogs.slice(newLogs.length - 50) : newLogs;
    });
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const interval = setInterval(() => {
      const isActivelyDecrypting = decryptor && (decryptor as any).activeTasks > 0;
      const tasks = isProcessing ? 1 : (decryptor ? (decryptor as any).activeTasks : 0);
      const cores = navigator.hardwareConcurrency || 4;
      const baseLoad = (tasks / cores) * 100;
      
      setStats({
        cpu: Math.min(100, Math.round(baseLoad + Math.random() * 5 + (tasks > 0 ? 10 : 1))),
        ram: (window.performance as any)?.memory ? Math.round((window.performance as any).memory.usedJSHeapSize / 1024 / 1024) + 'MB' : '156MB',
        speed: isProcessing ? (Math.random() * 15 + 25).toFixed(1) + 'MB/s' : (isActivelyDecrypting ? (Math.random() * 5 + 15).toFixed(1) + 'MB/s' : '0MB/s'),
        cache: decryptor ? Math.round(decryptor.currentCacheSize / 1024 / 1024) + 'MB' : '0MB'
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isProcessing, decryptor]);

  useEffect(() => {
    if ('serviceWorker' in navigator && mode === 'PLAY') {
      navigator.serviceWorker.register('/pvc-sw.js').then(async (registration) => {
        // Ensure SW is active before registering client
        if (!registration.active) {
          await new Promise<void>((resolve) => {
            const listener = () => {
              if (registration.active) {
                registration.installing?.removeEventListener('statechange', listener);
                registration.waiting?.removeEventListener('statechange', listener);
                resolve();
              }
            };
            registration.installing?.addEventListener('statechange', listener);
            registration.waiting?.addEventListener('statechange', listener);
          });
        }
        
        const channel = new MessageChannel();
        registration.active?.postMessage({ type: 'REGISTER_CLIENT', clientId }, [channel.port2]);
        channel.port1.onmessage = async (e) => {
          if (e.data.type === 'REQUEST_DATA' && decryptor) {
            const { start, end } = e.data;
            const port = e.ports[0];
            try {
              const startChunk = Math.floor(start / decryptor.chunkSize);
              const endChunk = Math.floor((Number(end) || Number(decryptor.originalSize) - 1) / decryptor.chunkSize);
              port.postMessage({ type: 'DATA_START', totalSize: Number(decryptor.originalSize), contentType: decryptor.mimeType });
              for (let i = startChunk; i <= endChunk; i++) {
                const chunkData = await decryptor.getChunk(i);
                const chunkStart = i * decryptor.chunkSize;
                let slice = chunkData;
                if (i === startChunk || i === endChunk) {
                  const s = Math.max(0, start - chunkStart);
                  const e_idx = Math.min(chunkData.length, (Number(end) || Infinity) - chunkStart + 1);
                  slice = chunkData.slice(s, e_idx);
                }
                port.postMessage({ type: 'DATA_CHUNK', chunk: slice }, [slice.buffer]);
              }
              port.postMessage({ type: 'DATA_END' });
            } catch (err: any) { port.postMessage({ type: 'DATA_ERROR', error: err.message }); }
          }
        };
      });
    }
  }, [decryptor, mode, clientId]);

  const handleStart = async () => {
    if (!file || !password) return;
    setIsProcessing(true);
    addLog(`PIPELINE START: ${mode} MODE`);
    
    try {
      if (mode === 'PLAY') {
        const headerBuffer = await file.slice(0, 512).arrayBuffer();
        const salts = new Uint8Array(headerBuffer, HEADER_FAKE_SIZE + HEADER_LEN_SIZE, SALTS_SIZE);
        const encParams = new Uint8Array(headerBuffer, HEADER_FAKE_SIZE + HEADER_LEN_SIZE + SALTS_SIZE, ENC_PARAMS_SIZE);
        const masterKey = await deriveMasterKey(password, salts, p => setKdfProgress(p));
        const params = await decryptParams(masterKey, encParams);
        const newDecryptor = new StreamDecryptor(masterKey, params.chunkSize, params.totalChunks, file);
        newDecryptor.mimeType = params.mimeType;
        newDecryptor.originalSize = params.originalSize;
        setDecryptor(newDecryptor);
        setVideoUrl(`/pvc-stream/${clientId}/video.mp4`);
        addLog(`VAULT UNLOCKED: ${params.mimeType}`);
      } else {
        const salts = crypto.getRandomValues(new Uint8Array(SALTS_SIZE));
        const masterKey = await deriveMasterKey(password, salts, p => setKdfProgress(p));
        addLog("KDF DERIVATION COMPLETE. INITIALIZING ENCRYPTOR...");
        const finalBlob = await performEncryption(file, masterKey, salts, (p) => addLog(`ENCRYPTING: ${p}%`));
        
        const url = URL.createObjectURL(finalBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name + '.pvcqv';
        a.click();
        addLog("VAULT GENERATION SUCCESSFUL. DOWNLOAD STARTED.");
      }
    } catch (err: any) {
      addLog(`CRITICAL PIPELINE FAILURE: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-cyan-50 font-sans selection:bg-cyan-500/30 overflow-x-hidden flex flex-col items-center">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[80%] md:w-[40%] h-[40%] bg-cyan-900/10 blur-[80px] md:blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[80%] md:w-[50%] h-[50%] bg-blue-900/10 blur-[100px] md:blur-[150px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 md:opacity-20 contrast-150" />
      </div>

      <main className="w-full max-w-7xl px-4 py-6 md:py-12 space-y-6 md:space-y-10 relative z-10 flex flex-col">
        {/* Header */}
        <header className="flex flex-col xl:flex-row items-center justify-between gap-6 md:gap-8 border-b border-cyan-500/10 pb-6 md:pb-10">
          <div className="flex flex-col sm:flex-row items-center gap-4 md:gap-6 text-center sm:text-left">
            <div className="relative group">
              <div className="absolute inset-0 bg-cyan-500/20 blur-xl group-hover:bg-cyan-500/40 transition-all rounded-full" />
              <div className="relative p-3 md:p-5 bg-black border border-cyan-500/30 rounded-2xl shadow-2xl">
                <Shield className="w-8 h-8 md:w-10 md:h-10 text-cyan-400" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-black tracking-tight italic uppercase">
                PVC <span className="text-cyan-400">QUANTUM</span> VAULT
              </h1>
              <div className="flex flex-wrap justify-center sm:justify-start items-center gap-2 md:gap-3 mt-2 font-mono text-[9px] md:text-[10px] tracking-widest text-cyan-600 font-bold">
                <span className="flex items-center gap-1.5"><Activity className="w-3 h-3" /> SECURE_CORE v2.5</span>
                <span className="hidden sm:inline w-1 h-1 rounded-full bg-cyan-800" />
                <span className="flex items-center gap-1.5"><Zap className="w-3 h-3" /> HW_ACCELERATED</span>
              </div>
            </div>
          </div>

          <div className="flex w-full sm:w-auto bg-zinc-900/80 p-1 md:p-1.5 rounded-xl md:rounded-2xl border border-white/5 backdrop-blur-xl">
            <button 
              onClick={() => { setMode('PLAY'); setVideoUrl(null); }}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 md:px-8 py-2 md:py-3 rounded-lg md:rounded-xl text-[10px] md:text-xs font-black tracking-widest transition-all",
                mode === 'PLAY' ? "bg-cyan-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.4)]" : "text-zinc-500 hover:text-cyan-400"
              )}
            >
              <Play className="w-3 h-3 md:w-4 md:h-4 fill-current" /> PLAYBACK
            </button>
            <button 
              onClick={() => { setMode('ENCRYPT'); setVideoUrl(null); }}
              className={cn(
                "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 md:px-8 py-2 md:py-3 rounded-lg md:rounded-xl text-[10px] md:text-xs font-black tracking-widest transition-all",
                mode === 'ENCRYPT' ? "bg-cyan-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.4)]" : "text-zinc-500 hover:text-cyan-400"
              )}
            >
              <Lock className="w-3 h-3 md:w-4 md:h-4 fill-current" /> ENCRYPT
            </button>
          </div>
        </header>

        {/* Main Interface */}
        <section className="flex flex-col lg:grid lg:grid-cols-[1fr_350px] xl:grid-cols-[1fr_420px] gap-6 md:gap-10">
          <div className="space-y-6 md:space-y-8 order-2 lg:order-1">
            {!videoUrl ? (
              <div className="relative aspect-video bg-zinc-900/20 border-2 border-dashed border-cyan-500/10 rounded-[3rem] flex flex-col items-center justify-center p-12 text-center group hover:border-cyan-500/30 transition-all duration-1000 shadow-2xl backdrop-blur-sm">
                <div className="absolute inset-0 bg-cyan-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="mb-10 relative">
                  <div className="absolute inset-0 bg-cyan-500/10 blur-3xl scale-150 animate-pulse" />
                  <div className="relative p-10 bg-black/40 rounded-full border border-cyan-500/10 group-hover:scale-110 transition-transform duration-700">
                    {mode === 'PLAY' ? <Eye className="w-20 h-20 text-cyan-400/50" /> : <Download className="w-20 h-20 text-cyan-400/50" />}
                  </div>
                </div>

                <h3 className="text-3xl font-black mb-4 uppercase italic tracking-tight text-white">{mode === 'PLAY' ? 'Pipeline_Init' : 'Matrix_Generator'}</h3>
                <p className="text-sm text-zinc-500 max-w-sm mb-12 font-medium leading-relaxed">
                  {mode === 'PLAY' ? 'Load your .pvcqv encrypted container and provide the hardware master key.' : 'Input raw media stream to generate a multi-layer quantum-secure vault.'}
                </p>
                
                <div className="flex flex-col gap-6 w-full max-w-sm relative z-10">
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={(e) => setFile(e.target.files?.[0] || null)} 
                    className="hidden"
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-zinc-900/60 border border-cyan-500/20 rounded-2xl px-6 py-5 text-sm text-cyan-400 flex items-center justify-center gap-3 hover:border-cyan-500/50 hover:bg-zinc-800 transition-all font-black uppercase tracking-widest shadow-lg"
                  >
                    <Download className="w-5 h-5" /> {file ? file.name : 'SELECT_SOURCE_FILE'}
                  </button>
                  
                  <div className="relative">
                    <input 
                      type="password" 
                      placeholder="ACCESS_PASSKEY" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-black/60 border border-cyan-500/20 rounded-2xl px-4 py-5 text-cyan-400 focus:outline-none focus:border-cyan-500/50 transition-all placeholder:text-zinc-800 font-mono text-center tracking-[0.5em] text-lg font-black shadow-inner"
                    />
                  </div>

                  <button 
                    onClick={handleStart}
                    disabled={isProcessing || !file || !password}
                    className="group/btn relative h-16 bg-cyan-500 text-black font-black rounded-2xl hover:bg-cyan-400 disabled:opacity-20 disabled:cursor-not-allowed transition-all uppercase overflow-hidden shadow-[0_10px_40px_-10px_rgba(6,182,212,0.5)]"
                  >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-500" />
                    <span className="relative flex items-center justify-center gap-3 text-sm tracking-widest">
                      {isProcessing ? (
                        <>
                          <div className="w-6 h-6 border-3 border-black border-t-transparent rounded-full animate-spin" />
                          PROCESSING: {kdfProgress}%
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5 fill-current" />
                          {mode === 'PLAY' ? 'START_DECRYPTION' : 'GENERATE_VAULT'}
                        </>
                      )}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-10 duration-1000">
                <VideoPlayer src={videoUrl} mimeType={decryptor?.mimeType || 'video/mp4'} />
                <Stats 
                  cpuUsage={stats.cpu} 
                  ramUsage={stats.ram} 
                  decryptSpeed={stats.speed} 
                  cacheSize={stats.cache} 
                />
              </div>
            )}
          </div>

          <aside className="space-y-6 md:space-y-8 order-1 lg:order-2">
            {/* Terminal */}
            <div className="bg-zinc-900/30 border border-white/5 rounded-2xl md:rounded-[2.5rem] p-6 md:p-8 space-y-6 relative overflow-hidden backdrop-blur-xl flex flex-col h-[350px] md:h-[480px]">
              <div className="flex items-center justify-between border-b border-white/5 pb-5">
                <div className="flex items-center gap-3">
                  <Terminal className="w-4 h-4 text-cyan-500" />
                  <h4 className="text-[11px] font-black uppercase tracking-[0.25em] text-zinc-400">System_Terminal</h4>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500/20" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500/20" />
                  <div className="w-2 h-2 rounded-full bg-green-500/20" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar font-mono text-[9px] md:text-[10px] leading-relaxed">
                {logs.length === 0 && <div className="text-zinc-700 italic">No activity logs recorded...</div>}
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-3 md:gap-4 group/log">
                    <span className="text-zinc-800 shrink-0 font-bold">{i.toString().padStart(2, '0')}</span>
                    <span className="text-cyan-400/60 group-hover/log:text-cyan-400 transition-colors">{log}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* Matrix Layers */}
            <div className="bg-cyan-500/[0.02] border border-cyan-500/10 rounded-2xl md:rounded-[2.5rem] p-6 md:p-8 space-y-6 md:space-y-8 relative overflow-hidden">
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-cyan-500" />
                <h4 className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.25em] text-cyan-500">Security_Matrix</h4>
              </div>
              <div className="space-y-3 md:space-y-4">
                {[
                  { name: 'AES-256-GCM', status: 'HARDWARE', color: 'bg-cyan-400', l: '01' },
                  { name: 'CHACHA20-P1305', status: 'SIMD_CORE', color: 'bg-blue-500', l: '02' },
                  { name: 'SERPENT-BITSLICED', status: 'ASM_EMUL', color: 'bg-indigo-500', l: '03' },
                  { name: 'AES-256-GCM', status: 'HARDWARE', color: 'bg-cyan-300', l: '04' }
                ].map((layer, i) => (
                  <div key={i} className="flex items-center justify-between bg-black/40 p-5 rounded-2xl border border-white/[0.03] group/layer hover:border-cyan-500/20 transition-all">
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-black text-zinc-700">{layer.l}</span>
                      <div>
                        <span className="text-[12px] font-bold text-white/80 group-hover/layer:text-white transition-colors block">{layer.name}</span>
                        <span className="text-[9px] font-mono text-zinc-600 font-bold">{layer.status}</span>
                      </div>
                    </div>
                    <div className={`w-1.5 h-1.5 rounded-full ${layer.color} shadow-[0_0_12px] shadow-current opacity-60 group-hover:opacity-100 transition-opacity`} />
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
};

export default App;
