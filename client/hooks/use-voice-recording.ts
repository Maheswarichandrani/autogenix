import { useState, useRef, useCallback } from "react";

// lib.dom has no SpeechRecognition types, so these cover only what this hook uses
interface SpeechRecognitionResultEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

interface UseVoiceRecordingOptions {
  onTranscript: (text: string) => void;
  onResize?: () => void;
  stopKeyword?: string;
}

interface UseVoiceRecordingReturn {
  isRecording: boolean;
  micError: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

export function useVoiceRecording({
  onTranscript,
  onResize,
  stopKeyword = "stop",
}: UseVoiceRecordingOptions): UseVoiceRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [micError, setMicError] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isStartingRef = useRef(false);
  const baseTextRef = useRef("");

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    const SpeechRecognition =
      (window as SpeechRecognitionWindow).SpeechRecognition ||
      (window as SpeechRecognitionWindow).webkitSpeechRecognition;

    // Guard: unsupported, already recording, or double-click
    if (!SpeechRecognition || isRecording || isStartingRef.current) return;

    isStartingRef.current = true;
    setTimeout(() => {
      isStartingRef.current = false;
    }, 300);

    setMicError(false);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const lastResult = event.results[event.results.length - 1];
      const lastWord = lastResult[0].transcript.trim().toLowerCase();

      // Stop keyword detected
      if (lastWord === stopKeyword) {
        recognition.stop();
        setIsRecording(false);
        return;
      }

      // Append new transcript to base text (preserves manual edits)
      const newTranscript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");

      onTranscript(baseTextRef.current + newTranscript);
      onResize?.();
    };

    recognition.onerror = () => {
      setMicError(true);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
    } catch {
      setMicError(true);
      isStartingRef.current = false;
    }
  }, [isRecording, onTranscript, onResize, stopKeyword]);

  return {
    isRecording,
    micError,
    startRecording,
    stopRecording,
  };
}