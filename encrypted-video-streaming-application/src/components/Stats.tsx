import React from 'react';
import { Cpu, Database, Zap, HardDrive } from 'lucide-react';
import { cn } from '../lib/utils';

export interface StatsProps {
  cpuUsage: number;
  ramUsage: string;
  decryptSpeed: string;
  cacheSize: string;
}

const Stats: React.FC<StatsProps> = ({ cpuUsage, ramUsage, decryptSpeed, cacheSize }) => {
  return (
    <div className={cn(
      "grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 p-4 md:p-8",
      "bg-zinc-900/40 border border-cyan-500/10 rounded-2xl md:rounded-[2.5rem]",
      "backdrop-blur-xl shadow-2xl transition-all duration-500"
    )}>
      <div className="flex items-center gap-3 md:gap-4">
        <div className="p-3 bg-cyan-500/5 rounded-2xl border border-cyan-500/10">
          <Cpu className="text-cyan-400 w-5 h-5" />
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1">CPU_LOAD</p>
          <p className="text-xl font-mono font-black text-white">{cpuUsage}%</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="p-3 bg-blue-500/5 rounded-2xl border border-blue-500/10">
          <Database className="text-blue-400 w-5 h-5" />
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1">HEAP_JS</p>
          <p className="text-xl font-mono font-black text-white">{ramUsage}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="p-3 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
          <Zap className="text-indigo-400 w-5 h-5" />
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1">BITRATE_DE</p>
          <p className="text-xl font-mono font-black text-white">{decryptSpeed}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="p-3 bg-purple-500/5 rounded-2xl border border-purple-500/10">
          <HardDrive className="text-purple-400 w-5 h-5" />
        </div>
        <div>
          <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1">CACHE_L3</p>
          <p className="text-xl font-mono font-black text-white">{cacheSize}</p>
        </div>
      </div>
    </div>
  );
};

export default Stats;
