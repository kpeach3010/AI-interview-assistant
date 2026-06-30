import { useState, useEffect, useRef, useCallback } from "react";

export function formatDurationText(ms: number | undefined | null): string {
  if (ms == null) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function useInterviewTimer() {
  const [sessionElapsedMs, setSessionElapsedMs] = useState(0);
  const [questionElapsedMs, setQuestionElapsedMs] = useState(0);
  const [isQuestionPaused, setIsQuestionPaused] = useState(false);
  const isQuestionPausedRef = useRef(false);
  const isSessionPausedRef = useRef(false);
  
  const currentQuestionIdRef = useRef<string | null>(null);
  
  // Track start times
  const sessionStartTimeRef = useRef<number>(Date.now());
  const questionStartTimeRef = useRef<number>(Date.now());

  // Accumulated times (in case we need to pause/resume in the future)
  const sessionAccumulatedRef = useRef<number>(0);
  const questionAccumulatedRef = useRef<number>(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (!isSessionPausedRef.current) {
        setSessionElapsedMs(sessionAccumulatedRef.current + (now - sessionStartTimeRef.current));
      }
      
      if (currentQuestionIdRef.current && !isQuestionPausedRef.current) {
        setQuestionElapsedMs(questionAccumulatedRef.current + (now - questionStartTimeRef.current));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const startQuestion = useCallback((questionId: string) => {
    const now = Date.now();
    let prevTime = null;
    
    // If there was a previous question running, calculate its total time
    if (currentQuestionIdRef.current && currentQuestionIdRef.current !== questionId) {
      prevTime = {
        questionId: currentQuestionIdRef.current,
        durationMs: questionAccumulatedRef.current + (now - questionStartTimeRef.current),
      };
    }
    
    if (currentQuestionIdRef.current !== questionId) {
      // Start new question
      currentQuestionIdRef.current = questionId;
      questionStartTimeRef.current = now;
      questionAccumulatedRef.current = 0;
      setQuestionElapsedMs(0);
      setIsQuestionPaused(false);
      isQuestionPausedRef.current = false;
      
      if (isSessionPausedRef.current) {
        isSessionPausedRef.current = false;
        sessionStartTimeRef.current = now;
      }
    }
    
    return prevTime;
  }, []);

  const pauseQuestion = useCallback(() => {
    if (currentQuestionIdRef.current && !isQuestionPausedRef.current) {
      const now = Date.now();
      questionAccumulatedRef.current += (now - questionStartTimeRef.current);
      setIsQuestionPaused(true);
      isQuestionPausedRef.current = true;
      setQuestionElapsedMs(questionAccumulatedRef.current);
      
      if (!isSessionPausedRef.current) {
        sessionAccumulatedRef.current += (now - sessionStartTimeRef.current);
        isSessionPausedRef.current = true;
        setSessionElapsedMs(sessionAccumulatedRef.current);
      }

      return {
        questionId: currentQuestionIdRef.current,
        durationMs: questionAccumulatedRef.current,
      };
    }
    return null;
  }, []);

  const completeSession = useCallback(() => {
    const now = Date.now();
    const durationMs = isSessionPausedRef.current 
      ? sessionAccumulatedRef.current 
      : sessionAccumulatedRef.current + (now - sessionStartTimeRef.current);
    return { durationMs };
  }, []);

  const initializeTimers = useCallback((sessionMs: number, questionMs: number, questionId?: string | null) => {
    sessionAccumulatedRef.current = sessionMs;
    questionAccumulatedRef.current = questionMs;
    setSessionElapsedMs(sessionMs);
    setQuestionElapsedMs(questionMs);
    sessionStartTimeRef.current = Date.now();
    questionStartTimeRef.current = Date.now();
    if (questionId) {
      currentQuestionIdRef.current = questionId;
    }
  }, []);

  const getCurrentQuestionTime = useCallback(() => {
    if (!currentQuestionIdRef.current) return null;
    const now = Date.now();
    const durationMs = isQuestionPausedRef.current
      ? questionAccumulatedRef.current
      : questionAccumulatedRef.current + (now - questionStartTimeRef.current);
    return {
      questionId: currentQuestionIdRef.current,
      durationMs,
    };
  }, []);

  return {
    sessionElapsedMs,
    questionElapsedMs,
    isQuestionPaused,
    startQuestion,
    pauseQuestion,
    completeSession,
    getCurrentQuestionTime,
    initializeTimers,
  };
}
