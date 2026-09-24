import React, { useState, useEffect, useRef, useCallback } from "react";
import { Icons } from "@/lib/icons";

interface TextToSpeechProps {
  content: string;
}

const MAX_CHUNK_LENGTH = 3000;

function splitIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHUNK_LENGTH) return [text];
  
  const chunks: string[] = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_LENGTH) {
      chunks.push(remaining);
      break;
    }
    
    // Find a good break point (sentence end) within the limit
    let breakPoint = remaining.lastIndexOf('. ', MAX_CHUNK_LENGTH);
    if (breakPoint < MAX_CHUNK_LENGTH * 0.5) {
      breakPoint = remaining.lastIndexOf('! ', MAX_CHUNK_LENGTH);
    }
    if (breakPoint < MAX_CHUNK_LENGTH * 0.5) {
      breakPoint = remaining.lastIndexOf('? ', MAX_CHUNK_LENGTH);
    }
    if (breakPoint < MAX_CHUNK_LENGTH * 0.3) {
      breakPoint = remaining.lastIndexOf(' ', MAX_CHUNK_LENGTH);
    }
    if (breakPoint <= 0) {
      breakPoint = MAX_CHUNK_LENGTH;
    } else {
      breakPoint += 1; // include the period/space
    }
    
    chunks.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }
  
  return chunks;
}

export const TextToSpeech: React.FC<TextToSpeechProps> = ({ content }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("");
  const [showVoices, setShowVoices] = useState(false);
  const chunksRef = useRef<string[]>([]);
  const currentChunkRef = useRef(0);
  const stoppedRef = useRef(false);

  useEffect(() => {
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length > 0) {
        setVoices(available);
        const saved = localStorage.getItem("case-file-tts-voice");
        if (saved && available.find((v) => v.voiceURI === saved)) {
          setSelectedVoiceURI(saved);
        } else {
          const premium = available.find(
            (v) =>
              v.lang.startsWith("en") &&
              (v.name.toLowerCase().includes("natural") ||
                v.name.toLowerCase().includes("premium") ||
                v.name.toLowerCase().includes("enhanced") ||
                v.name.toLowerCase().includes("neural"))
          );
          const english = available.find((v) => v.lang.startsWith("en"));
          const pick = premium || english || available[0];
          setSelectedVoiceURI(pick.voiceURI);
        }
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.cancel();
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const extractText = (html: string): string => {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || div.innerText || "";
  };

  const selectedVoice = voices.find((v) => v.voiceURI === selectedVoiceURI);

  const speakChunk = useCallback((index: number) => {
    if (stoppedRef.current || index >= chunksRef.current.length) {
      setIsPlaying(false);
      setIsPaused(false);
      return;
    }

    currentChunkRef.current = index;
    const utterance = new SpeechSynthesisUtterance(chunksRef.current[index]);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = 0.95;
    utterance.pitch = 1;

    utterance.onend = () => {
      if (!stoppedRef.current) {
        speakChunk(index + 1);
      }
    };

    utterance.onerror = () => {
      if (!stoppedRef.current) {
        speakChunk(index + 1);
      }
    };

    window.speechSynthesis.speak(utterance);
  }, [selectedVoice]);

  const handlePlay = () => {
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    const text = extractText(content);
    const chunks = splitIntoChunks(text);
    chunksRef.current = chunks;
    currentChunkRef.current = 0;
    stoppedRef.current = false;

    setIsPlaying(true);
    speakChunk(0);
  };

  const handlePause = () => {
    window.speechSynthesis.pause();
    setIsPaused(true);
    setIsPlaying(false);
  };

  const handleStop = () => {
    stoppedRef.current = true;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
  };

  const handleVoiceChange = (uri: string) => {
    setSelectedVoiceURI(uri);
    localStorage.setItem("case-file-tts-voice", uri);
    if (isPlaying || isPaused) {
      handleStop();
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isPlaying ? (
        <button
          onClick={handlePause}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
        >
          <Icons.Pause className="w-4 h-4" />
          Pause
        </button>
      ) : (
        <button
          onClick={handlePlay}
          className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
        >
          <Icons.Volume className="w-4 h-4" />
          {isPaused ? "Resume" : "Listen"}
        </button>
      )}
      {(isPlaying || isPaused) && (
        <button
          onClick={handleStop}
          className="text-muted-foreground hover:text-destructive transition-colors"
        >
          <Icons.Close className="w-4 h-4" />
        </button>
      )}

      {voices.length > 1 && (
        <div className="relative">
          <button
            onClick={() => setShowVoices(!showVoices)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded px-2 py-1"
          >
            {selectedVoice?.name?.split(" ").slice(0, 3).join(" ") || "Voice"}
          </button>
          {showVoices && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto min-w-[200px]">
              {voices
                .filter((v) => v.lang.startsWith("en"))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((voice) => (
                  <button
                    key={voice.voiceURI}
                    onClick={() => {
                      handleVoiceChange(voice.voiceURI);
                      setShowVoices(false);
                    }}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors ${
                      voice.voiceURI === selectedVoiceURI
                        ? "text-primary font-medium"
                        : "text-muted-foreground"
                    }`}
                  >
                    {voice.name}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TextToSpeech;
