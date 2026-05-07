import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { ClaudeMessage } from '../types';

const SCROLL_ANCHOR_ENABLED_CLASS = 'scroll-anchor-enabled';
const BOTTOM_THRESHOLD_PX = 100;

type ViewMode = 'chat' | 'history' | 'settings';

export interface UseScrollBehaviorOptions {
  currentView: ViewMode;
  messages: ClaudeMessage[];
  expandedThinking?: Record<string, boolean>;
  loading: boolean;
  streamingActive: boolean;
}

interface UseScrollBehaviorReturn {
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  inputAreaRef: React.RefObject<HTMLDivElement | null>;
  isUserAtBottomRef: React.MutableRefObject<boolean>;
  isAutoScrollingRef: React.MutableRefObject<boolean>;
  userPausedRef: React.MutableRefObject<boolean>;
  scrollToBottom: () => void;
}

/**
 * Hook for managing scroll behavior in the chat view
 * - Tracks if user is at bottom
 * - Auto-scrolls to bottom when user is at bottom and new content arrives
 * - User can scroll up to pause auto-scroll (wheel event detection)
 * - Auto-scroll resumes only when user scrolls back to bottom
 * - Handles view switching scroll behavior
 */
export function useScrollBehavior({
  currentView,
  messages,
  expandedThinking,
  loading,
  streamingActive,
}: UseScrollBehaviorOptions): UseScrollBehaviorReturn {
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputAreaRef = useRef<HTMLDivElement | null>(null);
  const isUserAtBottomRef = useRef(true);
  const isAutoScrollingRef = useRef(false);

  // Explicit scroll-pause flag. Set by wheel-up, cleared only when user
  // manually scrolls back to the very bottom. The scroll event handler
  // cannot override this — it prevents the race condition where handleScroll
  // fires right after handleWheel and resets isUserAtBottomRef to true
  // because the viewport is still within the 100px threshold.
  const userPausedRef = useRef(false);

  const syncScrollAnchoring = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const shouldEnableScrollAnchoring = userPausedRef.current || !isUserAtBottomRef.current;
    container.classList.toggle(SCROLL_ANCHOR_ENABLED_CLASS, shouldEnableScrollAnchoring);
  }, []);

  const syncUserAtBottomState = useCallback((container: HTMLDivElement) => {
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    isUserAtBottomRef.current = distanceFromBottom < BOTTOM_THRESHOLD_PX;
    syncScrollAnchoring();
  }, [syncScrollAnchoring]);

  // Scroll to bottom function
  //
  // Two-step strategy to handle `content-visibility: auto` correctly:
  //
  //   Step 1 — `scrollTop = scrollHeight`: gives a coarse landing point based
  //     on whatever the browser currently reports. With content-visibility,
  //     `scrollHeight` may be the sum of placeholder heights + real heights,
  //     so this alone may under-shoot.
  //
  //   Step 2 — `scrollIntoView({block: 'end'})` on the end-marker: instructs
  //     the browser to resolve the actual element position. Inside the
  //     scrolling container, this triggers layout of any deferred elements
  //     between the current scroll position and the end marker, so the final
  //     scrollTop lands on the real bottom regardless of placeholder sizes.
  //
  // Together they fix the symptom where streaming tool blocks appeared
  // "stuck" at the bottom of the viewport until the user manually scrolled.
  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    const endElement = messagesEndRef.current;

    if (!container && !endElement) return;

    isAutoScrollingRef.current = true;
    isUserAtBottomRef.current = true;
    container?.classList.remove(SCROLL_ANCHOR_ENABLED_CLASS);

    if (container) {
      // Force reflow on the last few messages before scrolling — when
      // `content-visibility: auto` is active, this ensures the recently-added
      // streaming content has accurate dimensions before the browser computes
      // the scroll target. Reading `offsetHeight` is enough to trigger layout.
      const recentMessages = container.querySelectorAll('.message');
      const recentCount = Math.min(5, recentMessages.length);
      for (let i = recentMessages.length - recentCount; i < recentMessages.length; i++) {
        const el = recentMessages[i];
        if (el instanceof HTMLElement) {
          void el.offsetHeight;
        }
      }
    }

    if (endElement) {
      // Force layout up to the end marker so subsequent scroll operations
      // see accurate dimensions even if intermediate messages are using
      // deferred (content-visibility) layout.
      void endElement.getBoundingClientRect();
      void endElement.offsetTop;
    }

    // Step 1: coarse scrollTop adjustment (fallback path + jsdom-friendly).
    if (container) {
      container.scrollTop = container.scrollHeight;
    }

    // Step 2: precise scrollIntoView (fixes content-visibility under-shoot).
    if (endElement) {
      try {
        endElement.scrollIntoView({ block: 'end', behavior: 'auto' });
      } catch {
        try {
          endElement.scrollIntoView(false);
        } catch {
          // No-op: scrollTop fallback already executed in Step 1.
        }
      }
    }

    requestAnimationFrame(() => {
      isAutoScrollingRef.current = false;
    });
  }, []);

  // Warm up layout after window regains focus (macOS JCEF drops GPU layers
  // when the window is in the background, causing a scroll stutter on return)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) return;
      const container = messagesContainerRef.current;
      if (!container) return;
      // Force layout recalculation before user's first scroll frame
      requestAnimationFrame(() => {
        void container.scrollHeight;
        void container.offsetHeight;
      });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Listen to scroll and wheel events to detect user scroll intent
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    syncScrollAnchoring();

    // Throttle scroll handler via rAF — fires at most once per frame
    let scrollRafId: number | null = null;
    const handleScroll = () => {
      if (scrollRafId !== null) return; // already scheduled
      scrollRafId = requestAnimationFrame(() => {
        scrollRafId = null;
        // Skip check during auto-scrolling to prevent false detection during fast streaming
        if (isAutoScrollingRef.current) return;
        // If user explicitly paused via wheel-up, don't let scroll handler override
        if (userPausedRef.current) return;
        // Calculate distance from bottom
        syncUserAtBottomState(container);
      });
    };

    // Wheel events are ALWAYS user-initiated and cannot be confused with
    // programmatic scrolls. This is the primary mechanism for detecting
    // user intent to pause or resume auto-scroll.
    let wheelRafId: number | null = null;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        // User is scrolling UP → pause auto-scroll immediately
        userPausedRef.current = true;
        isUserAtBottomRef.current = false;
        syncScrollAnchoring();
      } else if (e.deltaY > 0) {
        // User is scrolling DOWN → check if they reached the bottom to unpause
        if (wheelRafId !== null) cancelAnimationFrame(wheelRafId);
        wheelRafId = requestAnimationFrame(() => {
          wheelRafId = null;
          const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
          if (distanceFromBottom < BOTTOM_THRESHOLD_PX) {
            userPausedRef.current = false;
            isUserAtBottomRef.current = true;
          }
          syncScrollAnchoring();
        });
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('wheel', handleWheel);
      container.classList.remove(SCROLL_ANCHOR_ENABLED_CLASS);
      if (scrollRafId !== null) cancelAnimationFrame(scrollRafId);
      if (wheelRafId !== null) cancelAnimationFrame(wheelRafId);
    };
  }, [currentView, syncScrollAnchoring, syncUserAtBottomState]);

  // Follow content height changes that don't replace the message array, such as
  // subagent/task detail updates inside the currently streaming assistant block.
  // The observer should be stable across streaming ticks; only recreate on view change.
  useEffect(() => {
    if (currentView !== 'chat') return;
    const container = messagesContainerRef.current;
    if (!container) return;
    if (typeof ResizeObserver === 'undefined') return;

    const observedElement = messagesEndRef.current?.parentElement ?? container.firstElementChild;
    if (!(observedElement instanceof HTMLElement)) return;

    let resizeRafId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (resizeRafId !== null) {
        cancelAnimationFrame(resizeRafId);
      }
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = null;
        // Read current state from refs — these are updated by other effects/handlers
        const shouldStickToBottom = !userPausedRef.current && isUserAtBottomRef.current;
        if (userPausedRef.current) {
          syncScrollAnchoring();
          return;
        }
        if (shouldStickToBottom) {
          scrollToBottom();
          return;
        }
        syncUserAtBottomState(container);
      });
    });

    observer.observe(observedElement);
    return () => {
      observer.disconnect();
      if (resizeRafId !== null) {
        cancelAnimationFrame(resizeRafId);
      }
    };
  }, [currentView, scrollToBottom, syncScrollAnchoring, syncUserAtBottomState]);

  // Auto-scroll: follow latest content when user is at bottom
  // Includes streaming, expanded thinking blocks, loading indicator, etc.
  // During streaming, debounce with rAF to coalesce rapid state changes
  // from multiple update channels (onContentDelta + updateMessages) into
  // a single scroll-to-bottom per frame, preventing visual jitter.
  const scrollDebounceRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (currentView !== 'chat') return;
    syncScrollAnchoring();
    if (userPausedRef.current) return;
    if (!isUserAtBottomRef.current) return;

    if (streamingActive) {
      if (scrollDebounceRef.current !== null) {
        cancelAnimationFrame(scrollDebounceRef.current);
      }
      scrollDebounceRef.current = requestAnimationFrame(() => {
        scrollDebounceRef.current = null;
        if (!userPausedRef.current && isUserAtBottomRef.current) {
          scrollToBottom();
        }
      });
    } else {
      scrollToBottom();
    }
  }, [currentView, messages, expandedThinking, loading, streamingActive, scrollToBottom, syncScrollAnchoring]);

  // Cleanup scroll debounce on unmount
  useEffect(() => {
    return () => {
      if (scrollDebounceRef.current !== null) {
        cancelAnimationFrame(scrollDebounceRef.current);
      }
    };
  }, []);

  // Scroll to bottom when switching back to chat view
  useEffect(() => {
    if (currentView === 'chat') {
      // Use setTimeout to ensure view is fully rendered before scrolling
      const timer = setTimeout(() => {
        scrollToBottom();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [currentView, scrollToBottom]);

  return {
    messagesContainerRef,
    messagesEndRef,
    inputAreaRef,
    isUserAtBottomRef,
    isAutoScrollingRef,
    userPausedRef,
    scrollToBottom,
  };
}
