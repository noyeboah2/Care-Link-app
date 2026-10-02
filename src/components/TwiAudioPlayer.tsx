import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, Volume2 } from 'lucide-react';

interface TwiAudioPlayerProps {
  audioUrl: string;
  textEnglish: string;
  textTwi: string;
}

export const TwiAudioPlayer: React.FC<TwiAudioPlayerProps> = ({ audioUrl, textEnglish, textTwi }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSynthesized, setIsSynthesized] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {
        setIsSynthesized(true);
        const utterance = new SpeechSynthesisUtterance(textTwi);
        utterance.lang = 'ak-GH';
        utterance.rate = 0.85;
        utterance.onend = () => setIsPlaying(false);
        window.speechSynthesis.speak(utterance);
      });
      setIsPlaying(true);
    }
  };

  const resetAudio = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setProgress(0);
    }
  };

  return (
    <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl border border-slate-800 space-y-4">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Volume2 className="w-6 h-6 text-emerald-400 animate-pulse" />
          <span className="text-xs uppercase tracking-widest text-slate-400 font-bold">
            Twi Care Guidance (Mmoa Akwankyerɛ)
          </span>
        </div>
        {isSynthesized && (
          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
            Synthesized TTS
          </span>
        )}
      </div>

      <div className="space-y-2 bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/50">
        <p className="text-sm font-semibold text-emerald-300 font-serif leading-relaxed">
          "{textTwi}"
        </p>
        <p className="text-xs text-slate-400 italic">
          Eng: {textEnglish}
        </p>
      </div>

      <div className="space-y-1">
        <div className="w-full bg-slate-700 h-2.5 rounded-full overflow-hidden cursor-pointer">
          <div
            className="bg-emerald-500 h-full transition-all duration-150 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>{audioRef.current ? Math.floor(audioRef.current.currentTime) : 0}s</span>
          <span>{Math.floor(duration)}s</span>
        </div>
      </div>

      <div className="flex items-center justify-center space-x-6 pt-1">
        <button
          onClick={resetAudio}
          className="p-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition active:scale-95"
          aria-label="Restart Audio"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        <button
          onClick={togglePlay}
          className="w-16 h-16 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-600/30 active:scale-90 transition transform"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
        </button>
      </div>
    </div>
  );
};
