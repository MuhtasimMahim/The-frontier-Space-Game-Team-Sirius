import React, { useEffect, useRef, useState } from "react";
import type { StoryVideoDef } from "../game/storyVideos";

interface StoryVideoModalProps {
  video: StoryVideoDef;
  onClose: () => void;
  autoPlay?: boolean;
}

export const StoryVideoModal: React.FC<StoryVideoModalProps> = ({
  video,
  onClose,
  autoPlay = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(video.durationSeconds);
  const [audioBlocked, setAudioBlocked] = useState<boolean>(false);

  // Keyboard shortcut: Esc or Space to skip/close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        // Toggle play/pause on space
        if (videoRef.current) {
          if (videoRef.current.paused) {
            void videoRef.current.play();
          } else {
            videoRef.current.pause();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Attempt autoplay with sound, fall back to muted if browser blocks unmuted audio
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !autoPlay) return;

    el.currentTime = 0;
    el.muted = false;
    const playPromise = el.play();

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setAudioBlocked(false);
        })
        .catch(() => {
          // Browser prevented unmuted autoplay; mute and retry
          el.muted = true;
          setIsMuted(true);
          setAudioBlocked(true);
          el.play()
            .then(() => setIsPlaying(true))
            .catch(() => setIsPlaying(false));
        });
    }
  }, [autoPlay, video.src]);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setIsPlaying(true);
    } else {
      el.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setIsMuted(el.muted);
    if (!el.muted) setAudioBlocked(false);
  };

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
    if (el.duration && !isNaN(el.duration)) {
      setDuration(el.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    onClose();
  };

  const formatTime = (secs: number) => {
    const s = Math.floor(secs);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 sm:p-6 md:p-8 select-none font-gotham text-white"
    >
      <div
        className="relative w-full max-w-4xl bg-[#080C1A] rounded-[24px] overflow-hidden shadow-2xl flex flex-col border-2"
        style={{ borderColor: video.accent }}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0F172E]/90 border-b border-white/10 z-10">
          <div className="flex items-center gap-3">
            <span
              className="text-[10px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full border shadow-sm"
              style={{
                color: video.accent,
                borderColor: `${video.accent}88`,
                backgroundColor: `${video.accent}22`,
              }}
            >
              {video.badge}
            </span>
            <div className="flex flex-col">
              <h2 className="text-base sm:text-lg font-black text-white leading-tight">
                {video.title}
              </h2>
              <p className="text-xs text-[#AAB6DC] hidden sm:block truncate max-w-md">
                {video.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Video Canvas Container */}
        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden group">
          <video
            ref={videoRef}
            src={video.src}
            playsInline
            preload="auto"
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onClick={togglePlay}
            className="w-full h-full object-contain cursor-pointer"
          />

          {/* Audio unblock prompt banner if browser blocked audio */}
          {audioBlocked && (
            <button
              onClick={toggleMute}
              className="absolute top-4 left-4 z-20 px-3 py-1.5 rounded-full bg-[#FFD166] text-[#080C1A] text-xs font-bold flex items-center gap-2 shadow-lg animate-bounce hover:scale-105"
            >
              <span>🔇 Audio Muted</span>
              <span className="underline">Click for Sound 🔊</span>
            </button>
          )}

          {/* Large Center Play Overlay Button when paused */}
          {!isPlaying && (
            <div
              onClick={togglePlay}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] cursor-pointer"
            >
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-110 active:scale-95"
                style={{ backgroundColor: video.accent, color: "#080C1A" }}
              >
                <span className="text-3xl font-black ml-1">▶</span>
              </div>
              <p className="mt-3 text-sm font-bold text-white drop-shadow">
                Click to Play
              </p>
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div className="p-4 bg-[#0F172E] flex flex-col gap-3 border-t border-white/10">
          {/* Progress Timeline */}
          <div className="relative w-full h-2 bg-white/10 rounded-full overflow-hidden cursor-pointer">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: video.accent,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-xs font-mono">
            {/* Play/Pause & Mute Controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>{isPlaying ? "⏸ Pause" : "▶ Play"}</span>
              </button>

              <button
                onClick={toggleMute}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>{isMuted ? "🔇 Muted" : "🔊 Sound"}</span>
              </button>

              <span className="text-[#AAB6DC] ml-2">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Bottom Primary Action: Skip Intro */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-[#AAB6DC] hidden md:inline">
                Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white">Esc</kbd> to skip intro
              </span>
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-full font-black text-sm tracking-wide transition-all cursor-pointer flex items-center gap-2 hover:scale-105 active:scale-95 shadow-md uppercase"
                style={{
                  backgroundColor: video.accent,
                  color: "#080C1A",
                }}
              >
                <span>Skip Intro</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
