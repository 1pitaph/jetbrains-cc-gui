# Editor Popup Icon Regression Design

## Problem

The editor right-click menu currently shows the same icon for these three actions:

- `Send Selected Code to CC GUI`
- `Ask CC GUI`
- `Copy AI Reference`

This is a regression introduced by action icon configuration, not by IntelliJ popup rendering behavior. The current `plugin.xml` assigns all three actions the same icon resource: `/icons/cc-gui-icon.svg`.

## Context and Findings

- The affected actions are declared in `src/main/resources/META-INF/plugin.xml`.
- Repository history shows that `Send Selected Code to CC GUI` previously used `/icons/send-to-terminal.svg`.
- Repository history shows that `Ask CC GUI` previously used `/icons/quick-fix.svg`.
- `Copy AI Reference` was added later and does not have a dedicated icon asset in the repository.
- The selected baseline for comparison is `origin/feature/v0.4.1`.
- The agreed scope is limited to the three editor popup actions above. Other popup actions are intentionally out of scope for this fix.

## Goal

Restore distinct, semantically appropriate icons for the editor popup actions without expanding scope or introducing new icon assets.

## Chosen Approach

Use a minimal declarative fix in `plugin.xml` only:

- `ClaudeCodeGUI.SendSelectionToTerminalAction` -> `/icons/send-to-terminal.svg`
- `ClaudeCodeGUI.QuickFixWithClaudeAction` -> `/icons/quick-fix.svg`
- `ClaudeCodeGUI.CopySelectionReferenceAction` -> keep `/icons/cc-gui-icon.svg`

This approach is chosen because it matches prior repository behavior for the first two actions, keeps the current `plugin.xml`-driven action registration model, and avoids unnecessary structural refactoring.

## Alternatives Considered

### 1. Centralize icon assignment in Java action classes

Rejected for this fix. It would spread a small regression repair across multiple files and change the current responsibility boundary without enough payoff.

### 2. Add a brand-new icon for `Copy AI Reference`

Rejected for this fix. It expands scope into asset design and introduces a decision the user explicitly deferred.

### 3. Keep all three actions on the shared CC GUI icon

Rejected because it preserves the current regression and does not restore the historical distinction between the first two actions.

## Implementation Boundaries

### In scope

- Update the icon declarations for the three editor popup actions in `src/main/resources/META-INF/plugin.xml`.
- Reuse existing icon assets already present in `src/main/resources/icons/`.

### Out of scope

- Creating new icon assets
- Refactoring action registration
- Changing Java action implementations
- Updating other popup or toolbar actions

## Validation Plan

1. Confirm the three action declarations in `plugin.xml` point to the intended icon resources.
2. Confirm the referenced icon files exist in `src/main/resources/icons/`.
3. Run the relevant existing build/test command(s) needed to catch resource or plugin descriptor issues after the change.

## Error Handling and Failure Mode

This is a descriptor-level configuration fix. No new runtime fallback behavior should be added. If an icon path is invalid, the failure should remain visible through the existing build or runtime mechanisms rather than being silently masked.

## Risks

- IntelliJ theme or platform behavior may still visually de-emphasize popup icons in some environments even when the action declarations are correct.
- `Copy AI Reference` will still use the shared CC GUI icon by design until a separate icon asset is intentionally introduced in a future change.

## Success Criteria

- `Send Selected Code to CC GUI` no longer shares the same icon as `Ask CC GUI`.
- `Ask CC GUI` uses its historical quick-fix icon again.
- `Copy AI Reference` remains functional and continues to use the shared CC GUI icon.
- The fix is limited to the agreed three-action scope.
