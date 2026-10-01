import React from 'react';
import { Shield } from 'lucide-react';

interface VideoPlayerProps {
  src: string;
  mimeType: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src }) => {
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="relative w-full aspect-video bg-black rounded-[2rem] overflow-hidden border border-cyan-500/20 shadow-[0_0_50px_rgba(6,182,212,0.2)]">
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 p-6 text-center">
          <Shield className="w-12 h-12 text-red-500 mb-4 opacity-50" />
          <p className="text-red-500 font-mono text-sm uppercase font-black tracking-tighter">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-zinc-900 border border-white/5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors">Restart Pipeline</button>
        </div>
      ) : (
        <video 
          src={src} 
          controls 
          className="w-full h-full object-contain"
          autoPlay
          onError={(e) => {
            const video = e.target as HTMLVideoElement;
            if (video.error?.code === 4) setError("PIPELINE_LOST: Service Worker context mismatch or data corruption.");
            else setError(`MEDIA_ERROR: Code ${video.error?.code}`);
          }}
        />
      )}
      <div className="absolute top-4 left-4 flex gap-2">
        <div className="px-2 py-1 bg-black/60 backdrop-blur-md border border-cyan-500/30 rounded text-[10px] font-mono text-cyan-400">
          STREAMING DECRYPTED_BITSTREAM
        </div>
        <div className="px-2 py-1 bg-black/60 backdrop-blur-md border border-cyan-500/30 rounded text-[10px] font-mono text-cyan-400 animate-pulse">
          LIVE_DECODE
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
