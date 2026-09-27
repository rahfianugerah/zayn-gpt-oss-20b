import { useRef, useState, useSyncExternalStore } from "react";

// The slice of the Web Speech API this uses; TypeScript's DOM library does not ship its types
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

const recognitionClass = () =>
  (window as RecognitionWindow).SpeechRecognition ?? (window as RecognitionWindow).webkitSpeechRecognition;

const MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it for this site to dictate.",
  "service-not-allowed": "Microphone access is blocked. Allow it for this site to dictate.",
  "audio-capture": "No microphone was found.",
  network: "Dictation needs a connection to the browser's speech service.",
};

/**
 * Speech to text through the browser's own speech service. What is said is added after the text
 * already in the box, as it is recognized. Where the browser has no speech service, isSupported is
 * false and the caller hides its button.
 */
export function useDictation(text: string, setText: (text: string) => void, onError: (message: string) => void) {
  const isSupported = useSyncExternalStore(
    () => () => {},
    () => Boolean(recognitionClass()),
    () => false,
  );
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);

  function toggle() {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const RecognitionClass = recognitionClass();
    if (!RecognitionClass) return;
    const recognition = new RecognitionClass();
    recognition.lang = navigator.language;
    recognition.continuous = true;
    recognition.interimResults = false;
    const before = text.trimEnd();
    recognition.onresult = (event) => {
      const spoken = Array.from(event.results, (result) => result[0].transcript.trim()).join(" ");
      setText(before ? `${before} ${spoken}` : spoken);
    };
    // "aborted" and "no-speech" are the user stopping or saying nothing, not failures worth a banner
    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        onError(MESSAGES[event.error] ?? "Dictation stopped because of an error.");
      }
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  // Stops without taking the last words, for when the message has just been sent and the box
  // cleared; a late result would otherwise put the old text back
  function cancel() {
    if (!recognitionRef.current) return;
    recognitionRef.current.onresult = null;
    recognitionRef.current.stop();
  }

  return { isSupported, isListening, toggle, cancel };
}
