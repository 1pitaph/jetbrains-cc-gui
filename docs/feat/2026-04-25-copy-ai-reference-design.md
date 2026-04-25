# Copy AI Reference Design

## Overview

This document describes a new editor action named **Copy AI Reference**.

The goal is to let users copy the selected code location as a reference string such as `@D:\Code\idea-claude-code-gui\src\main\java\Foo.java#L12-L24` directly from the editor context menu, without sending anything to the CC GUI chat input.

## Problem Statement

The plugin already provides **Send Selected Code to CC GUI Plugin** from the editor context menu. That action extracts the selected range and converts it into a reference string, then inserts the reference into the chat input.

Users also have an existing mental model for "copying a reference" inside the chat UI, where the result is written directly to the system clipboard.

What is missing is an editor-side action that keeps the same reference format but copies it directly, so users can paste the reference anywhere they want.

## Feature Scope

### In Scope

- Add a new editor context menu action named **Copy AI Reference**
- Enable it only when the current editor has a non-empty selection
- Generate the exact same reference format currently used by the existing send action
- Keep the path format as an absolute path
- Write the generated reference directly to the system clipboard
- Reuse shared logic so the send action and copy action cannot drift in formatting behavior

### Out of Scope

- Changing the format to project-relative paths
- Copying selected code content together with the reference
- Adding a new keyboard shortcut in this iteration
- Routing clipboard writes through the webview or requiring the tool window to be open
- Changing the existing send action UX

## Approved Product Decisions

1. The new capability is exposed as a **separate editor context menu action**
2. The copied content is **only** the reference string
3. The reference keeps the current **absolute path** format
4. When there is no selection, the action should behave like the current send action and remain unavailable

## Proposed Approach

Use a shared Java-side reference builder and keep the two actions separate:

- **Send Selected Code to CC GUI Plugin** keeps its current responsibility: generate a reference and send it to the chat input
- **Copy AI Reference** generates the same reference and writes it to the clipboard

This is preferred over duplicating the selection parsing logic because the formatting rules, edge-case handling, and future maintenance stay centralized.

It is also preferred over a webview-mediated flow because this action starts from the editor and should not depend on the tool window lifecycle.

## Architecture and Components

### 1. Shared Selection Reference Builder

Extract the selection-to-reference logic from `SendSelectionToTerminalAction` into a shared Java-side component.

Responsibilities:

- Validate that `Project`, `Editor`, and selected text are available
- Resolve the current file path from the active editor
- Compute one-based start and end line numbers from the selection offsets
- Format the final reference string

Output rules:

- Single-line selection: `@<absolute-path>#L<line>`
- Multi-line selection: `@<absolute-path>#L<start>-<end>`

The shared component should return a successful result with the reference string, or a failure result that allows the caller to show a user-facing message consistent with current behavior.

### 2. Existing Send Action

`SendSelectionToTerminalAction` will be updated to depend on the shared builder instead of owning the formatting logic inline.

Its behavior remains the same:

- build the reference
- activate the CCG tool window if needed
- insert the reference into the chat input

No user-facing behavior change is intended for this action.

### 3. New Copy Action

Add a new Java action, tentatively named `CopySelectionReferenceAction`.

Responsibilities:

- reuse the shared builder
- write the built reference to the system clipboard
- avoid opening or activating the tool window

The action is registered in the editor context menu near the existing send action so users can discover the two actions together.

### 4. Action Availability

The new action should use the same availability rule as the current send action:

- enabled and visible only when the active editor exists and the selection is not empty

This keeps the UX predictable and avoids introducing a separate "copy current line" or "copy current file" behavior that was not requested.

## Data Flow

The execution flow for the new action is:

1. User selects code in the editor
2. User invokes **Copy AI Reference** from the editor context menu
3. The action gathers editor context
4. The shared builder converts the selection into a reference string
5. The action writes the reference to the system clipboard
6. The user pastes the reference wherever needed

The execution flow for the existing send action becomes:

1. User selects code in the editor
2. User invokes **Send Selected Code to CC GUI Plugin**
3. The shared builder converts the selection into a reference string
4. The action sends the reference into the CC GUI chat input

The key design rule is that step 3 must produce the same output for both actions.

## Error Handling

### Validation Failures

If the action cannot resolve the project, editor, selected text, file, or file path, it should fail explicitly and follow the existing action style for user messaging.

This design intentionally avoids silent fallbacks such as:

- copying the current line when nothing is selected
- copying the whole file when selection lookup fails
- trying to infer a different path format

### Clipboard Failures

If writing to the system clipboard fails:

- log the error
- show a user-visible failure message

Do not fall back to routing the copy through the webview bridge. That would make the editor-side action dependent on unrelated UI state.

## UI and Localization

### Action Placement

Register the new action in `plugin.xml` under `EditorPopupMenu`, placed adjacent to the existing send action.

### Action Text

The current working label is **Copy AI Reference**.

The final implementation should add localized message keys for:

- action text
- action description
- any new failure or success feedback that is introduced

## Testing Strategy

### Unit-Level Verification

Add focused tests for the shared reference builder:

- builds a single-line reference correctly
- builds a multi-line reference correctly
- rejects empty selections
- rejects missing editor or file context

### Action-Level Verification

Add tests for the new action behavior where practical:

- action is enabled only when selection exists
- copy action does not activate the tool window
- send action still behaves as before after refactoring
- send action and copy action produce identical reference strings for the same selection

### Manual Verification

Confirm the following in the IDE:

1. Select text in the editor and open the context menu
2. The new **Copy AI Reference** action is visible
3. Triggering it writes `@<absolute-path>#Lx-Ly` into the system clipboard
4. The existing send action still inserts the same reference into the chat input

## Risks and Mitigations

### Risk: Behavior Drift Between Copy and Send

Mitigation: both actions must consume the same shared builder output rather than each formatting independently.

### Risk: Clipboard Behavior Varies by Platform

Mitigation: keep the implementation in the existing Java plugin layer, where clipboard handling is already an established pattern in the repository.

### Risk: Existing Send Action Regresses During Refactor

Mitigation: treat the refactor as behavior-preserving and verify that the existing action still generates the same reference string and activation flow as before.

## Implementation Notes

- Prefer a small shared component with a single purpose over adding more responsibilities to the existing action class
- Keep the implementation inside the Java plugin layer; no Node bridge or webview changes are needed by design
- Follow existing action registration and i18n patterns already used by editor actions

