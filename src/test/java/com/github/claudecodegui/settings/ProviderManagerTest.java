package com.github.claudecodegui.settings;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.Test;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/**
 * ProviderManager 回归测试。
 */
public class ProviderManagerTest {
    /**
     * current 为空时，应默认启用本地 settings.json Provider。
     */
    @Test
    public void shouldDefaultActiveProviderToLocalSettingsWhenCurrentIsBlank() {
        AtomicReference<JsonObject> configRef = new AtomicReference<>(createConfigWithCurrent(""));
        ProviderManager manager = createProviderManager(configRef);

        JsonObject activeProvider = manager.getActiveClaudeProvider();

        assertNotNull(activeProvider);
        assertEquals(ProviderManager.LOCAL_SETTINGS_PROVIDER_ID, activeProvider.get("id").getAsString());
        assertEquals(
                ProviderManager.LOCAL_SETTINGS_PROVIDER_ID,
                configRef.get().getAsJsonObject("claude").get("current").getAsString()
        );
    }

    /**
     * current 缺失时，Provider 列表里也应把本地 settings.json 标记为启用状态。
     */
    @Test
    public void shouldMarkLocalProviderAsActiveWhenCurrentIsMissing() {
        JsonObject config = new JsonObject();
        JsonObject claude = new JsonObject();
        claude.add("providers", new JsonObject());
        config.add("claude", claude);

        AtomicReference<JsonObject> configRef = new AtomicReference<>(config);
        ProviderManager manager = createProviderManager(configRef);

        List<JsonObject> providers = manager.getClaudeProviders();

        assertEquals(ProviderManager.LOCAL_SETTINGS_PROVIDER_ID, providers.get(0).get("id").getAsString());
        assertTrue(providers.get(0).get("isActive").getAsBoolean());
        assertEquals(
                ProviderManager.LOCAL_SETTINGS_PROVIDER_ID,
                configRef.get().getAsJsonObject("claude").get("current").getAsString()
        );
    }

    /**
     * 构造仅使用内存配置的 ProviderManager，避免测试依赖真实文件系统。
     */
    private ProviderManager createProviderManager(AtomicReference<JsonObject> configRef) {
        Gson gson = new Gson();
        ClaudeSettingsManager claudeSettingsManager = new ClaudeSettingsManager(gson, null) {
            @Override
            public JsonObject readClaudeSettings() {
                JsonObject settings = new JsonObject();
                settings.add("env", new JsonObject());
                return settings;
            }
        };

        return new ProviderManager(
                gson,
                ignored -> configRef.get(),
                updated -> configRef.set(JsonParser.parseString(updated.toString()).getAsJsonObject()),
                null,
                claudeSettingsManager
        );
    }

    /**
     * 构造最小 Claude 配置。
     */
    private JsonObject createConfigWithCurrent(String current) {
        JsonObject config = new JsonObject();
        JsonObject claude = new JsonObject();
        claude.addProperty("current", current);
        claude.add("providers", new JsonObject());
        config.add("claude", claude);
        return config;
    }
}
