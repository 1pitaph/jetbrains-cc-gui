package com.github.claudecodegui.action.editor;

import com.github.claudecodegui.i18n.ClaudeCodeGuiBundle;
import org.jetbrains.annotations.NotNull;

import java.util.function.Consumer;

final class SelectionReferenceFailureHandler {

    private static final String SELECT_CODE_FIRST_KEY = "send.selectCodeFirst";
    private static final String UNKNOWN_ERROR = "Unknown error";

    private SelectionReferenceFailureHandler() {
    }

    static void showBuildFailure(@NotNull SelectionReferenceBuilder.Result result,
                                 @NotNull Consumer<String> infoCallback,
                                 @NotNull Consumer<String> errorCallback) {
        String messageKey = result.getMessageKey();
        if (messageKey == null) {
            errorCallback.accept(ClaudeCodeGuiBundle.message("send.failed", UNKNOWN_ERROR));
            return;
        }

        String message = ClaudeCodeGuiBundle.message(messageKey);
        if (SELECT_CODE_FIRST_KEY.equals(messageKey)) {
            infoCallback.accept(message);
            return;
        }
        errorCallback.accept(message);
    }
}
