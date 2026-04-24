package com.github.claudecodegui.provider.codex;

import com.google.gson.JsonObject;
import org.junit.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.junit.Assert.assertEquals;

public class CodexSDKBridgeHistoryTest {

    @Test
    public void getSessionMessagesReadsPersistedCodexHistory() throws IOException {
        Path sessionsDir = Files.createTempDirectory("codex-sdk-bridge-history");
        try {
            writeSessionFile(
                    sessionsDir,
                    "session-restore",
                    line("2026-03-10T10:00:00Z", "event_msg",
                            "{\"type\":\"user_message\",\"message\":\"Restore Codex tab\"}"),
                    line("2026-03-10T10:01:00Z", "response_item",
                            "{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"Restored from Codex history\"}]}" )
            );

            CodexSDKBridge bridge = new CodexSDKBridge(sessionsDir);

            List<JsonObject> messages = bridge.getSessionMessages("session-restore", sessionsDir.toString());

            assertEquals(2, messages.size());
            assertEquals("user", messages.get(0).get("type").getAsString());
            assertEquals("Restore Codex tab", messages.get(0).get("content").getAsString());
            assertEquals("assistant", messages.get(1).get("type").getAsString());
            assertEquals("Restored from Codex history", messages.get(1).get("content").getAsString());
        } finally {
            deleteDirectory(sessionsDir);
        }
    }

    private static Path writeSessionFile(Path dir, String sessionId, String... lines) throws IOException {
        Files.createDirectories(dir);
        Path file = dir.resolve(sessionId + ".jsonl");
        Files.write(file, String.join("\n", lines).concat("\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
        return file;
    }

    private static String line(String timestamp, String type, String payloadJson) {
        return "{\"timestamp\":\"" + timestamp + "\",\"type\":\"" + type + "\",\"payload\":" + payloadJson + "}";
    }

    private static void deleteDirectory(Path path) throws IOException {
        if (!Files.exists(path)) {
            return;
        }
        try (java.util.stream.Stream<Path> paths = Files.walk(path)) {
            paths.sorted(java.util.Comparator.reverseOrder()).forEach(p -> {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {
                }
            });
        }
    }
}
