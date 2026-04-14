package com.github.claudecodegui.session;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import org.junit.Before;
import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * Tests for ClaudeMessageHandler dedup logic.
 * Uses a recording CallbackHandler to verify notifications.
 */
public class ClaudeMessageHandlerDedupTest {

    private RecordingCallbackHandler callbackHandler;
    private ClaudeMessageHandler handler;

    @Before
    public void setUp() {
        callbackHandler = new RecordingCallbackHandler();
        SessionState state = new SessionState();
        MessageParser messageParser = new MessageParser();
        MessageMerger messageMerger = new MessageMerger();
        Gson gson = new GsonBuilder().create();

        handler = new ClaudeMessageHandler(
                null, // project not needed for these tests
                state,
                callbackHandler,
                messageParser,
                messageMerger,
                gson
        );
    }

    /**
     * Test that content delta is skipped when it duplicates existing content after conservative sync.
     */
    @Test
    public void handleContentDelta_skipsDuplicateAfterConservativeSync() {
        // Simulate stream start
        handler.onMessage("stream_start", "");
        callbackHandler.clear();

        // Simulate conservative sync with full content "ABC"
        String fullMessage = "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"ABC\"}]}}";
        handler.onMessage("assistant", fullMessage);
        callbackHandler.clear();

        // Now try to send a duplicate delta "C" which is already in "ABC"
        handler.onMessage("content_delta", "C");

        // Should NOT notify frontend about the duplicate delta
        assertTrue("Duplicate delta should not be notified",
                callbackHandler.contentDeltas.isEmpty());
    }

    /**
     * Test that non-duplicate delta is processed normally.
     */
    @Test
    public void handleContentDelta_processesNonDuplicateNormally() {
        // Simulate stream start
        handler.onMessage("stream_start", "");
        callbackHandler.clear();

        // Send a normal delta "ABC"
        handler.onMessage("content_delta", "ABC");

        // Should notify frontend
        assertEquals("Non-duplicate delta should be notified",
                List.of("ABC"), callbackHandler.contentDeltas);

        callbackHandler.clear();

        // Send another non-duplicate delta "DEF"
        handler.onMessage("content_delta", "DEF");

        // Should notify frontend
        assertEquals("Second non-duplicate delta should be notified",
                List.of("DEF"), callbackHandler.contentDeltas);
    }

    /**
     * Test that thinking delta is processed when not duplicate.
     */
    @Test
    public void handleThinkingDelta_processesNonDuplicateNormally() {
        // Simulate stream start
        handler.onMessage("stream_start", "");
        callbackHandler.clear();

        // Send a thinking delta directly - handleThinkingDelta sets isThinking internally
        handler.onMessage("thinking_delta", "Let me think");

        // Should notify frontend
        assertEquals("Non-duplicate thinking delta should be notified",
                List.of("Let me think"), callbackHandler.thinkingDeltas);
    }

    /**
     * Test that syncedContentOffset is reset on stream end.
     */
    @Test
    public void streamEnd_resetsSyncedContentOffset() {
        // Simulate stream start
        handler.onMessage("stream_start", "");

        // Send some content
        handler.onMessage("content_delta", "ABC");

        // End stream
        handler.onMessage("stream_end", "");

        // Start a new stream
        handler.onMessage("stream_start", "");
        callbackHandler.clear();

        // Send a new delta (should not be dedup'd because offset was reset)
        handler.onMessage("content_delta", "ABC");

        // Should notify frontend (not dedup'd)
        assertEquals("Delta after stream end reset should be notified",
                List.of("ABC"), callbackHandler.contentDeltas);
    }

    /**
     * Test that syncedThinkingOffset is reset on stream end.
     */
    @Test
    public void streamEnd_resetsSyncedThinkingOffset() {
        // Simulate stream start
        handler.onMessage("stream_start", "");

        // Send thinking delta directly - handleThinkingDelta sets isThinking internally
        handler.onMessage("thinking_delta", "Analysis");

        // End stream
        handler.onMessage("stream_end", "");

        // Start a new stream
        handler.onMessage("stream_start", "");
        callbackHandler.clear();

        // Send the same delta (should not be dedup'd because offset was reset)
        handler.onMessage("thinking_delta", "Analysis");

        // Should notify frontend (not dedup'd because offset was reset)
        assertEquals("Thinking delta after stream end reset should be notified",
                List.of("Analysis"), callbackHandler.thinkingDeltas);
    }

    /**
     * Test that very short delta (single char) matching suffix is dedup'd.
     * This is a known trade-off documented in the code.
     */
    @Test
    public void handleContentDelta_shortDeltaSuffixMatchIsDedupd() {
        // Simulate stream start
        handler.onMessage("stream_start", "");
        callbackHandler.clear();

        // Simulate conservative sync with content "A"
        String fullMessage = "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"A\"}]}}";
        handler.onMessage("assistant", fullMessage);
        callbackHandler.clear();

        // Send delta "A" - matches the suffix of existing content "A"
        handler.onMessage("content_delta", "A");

        // Should be dedup'd (this is the documented trade-off)
        assertTrue("Short delta suffix match should be dedup'd",
                callbackHandler.contentDeltas.isEmpty());
    }

    /**
     * Test that dedup does not trigger when syncedContentOffset is zero.
     */
    @Test
    public void handleContentDelta_noDedupWhenOffsetIsZero() {
        // Simulate stream start (syncedContentOffset is 0)
        handler.onMessage("stream_start", "");
        callbackHandler.clear();

        // Send delta "A" - offset is 0, no dedup
        handler.onMessage("content_delta", "A");

        // Should be processed (offset is 0, no dedup)
        assertEquals("First delta should be processed when offset is zero",
                List.of("A"), callbackHandler.contentDeltas);
    }

    /**
     * Recording callback handler that captures all notifications for testing.
     * Extends CallbackHandler and overrides relevant methods.
     */
    private static class RecordingCallbackHandler extends CallbackHandler {
        final List<String> contentDeltas = new ArrayList<>();
        final List<String> thinkingDeltas = new ArrayList<>();
        int streamStartCount = 0;
        int streamEndCount = 0;

        void clear() {
            contentDeltas.clear();
            thinkingDeltas.clear();
        }

        @Override
        public void notifyContentDelta(String delta) {
            contentDeltas.add(delta);
        }

        @Override
        public void notifyThinkingDelta(String delta) {
            thinkingDeltas.add(delta);
        }

        @Override
        public void notifyStreamStart() {
            streamStartCount++;
        }

        @Override
        public void notifyStreamEnd() {
            streamEndCount++;
        }
    }
}
