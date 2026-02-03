import React, { useState, useEffect, useRef } from "react";
import { Icons } from "@/lib/icons";

interface TextToSpeechProps {
  content: string;
}

export const TextToSpeech: React.FC<TextToSpeechProps> = ({ content }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      if (utteranceRef.current) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const extractText = (html: string): string => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
  };

  const handlePlay = () => {
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    const text = extractText(content);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
  };

  const handlePause = () => {
    window.speechSynthesis.pause();
    setIsPaused(true);
    setIsPlaying(false);
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
  };

  return (
    <div className="flex items-center gap-2">
      {isPlaying ? (
        <button
          onClick={handlePause}
          className="flex items-center gap-2 text-stone-500 hover:text-sky-400 transition-colors"
        >
          <Icons.Pause className="w-4 h-4" />
          Pause
        </button>
      ) : (
        <button
          onClick={handlePlay}
          className="flex items-center gap-2 text-stone-500 hover:text-sky-400 transition-colors"
        >
          <Icons.Volume className="w-4 h-4" />
          {isPaused ? "Resume" : "Listen"}
        </button>
      )}
      {(isPlaying || isPaused) && (
        <button
          onClick={handleStop}
          className="text-stone-500 hover:text-red-400 transition-colors"
        >
          <Icons.Close className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default TextToSpeech;
