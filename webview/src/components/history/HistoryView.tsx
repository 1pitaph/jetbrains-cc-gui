import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { HistoryData, HistorySessionSummary } from '../../types';
import VirtualList from './VirtualList';
import { extractCommandMessageContent } from '../../utils/messageUtils';
import { sendBridgeEvent } from '../../utils/bridge';
import { ProviderModelIcon } from '../shared/ProviderModelIcon';
import { copyToClipboard } from '../../utils/copyUtils';

// Deep search timeout (milliseconds)
const DEEP_SEARCH_TIMEOUT_MS = 30000;

// Module-level style constants (avoid breaking memoization)
const PROVIDER_BADGE_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  marginRight: '8px',
  verticalAlign: 'middle',
};

const HIGHLIGHT_MARK_STYLE: React.CSSProperties = {
  backgroundColor: '#ffd700',
  color: '#000',
  padding: '0 2px',
};

const ROOT_STYLE: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
};

const LIST_WRAPPER_STYLE: React.CSSProperties = {
  flex: 1,
  overflow: 'hidden',
};

const SPINNER_STYLE: React.CSSProperties = {
  width: '48px',
  height: '48px',
  margin: '0 auto 16px',
  border: '4px solid rgba(133, 133, 133, 0.2)',
  borderTop: '4px solid #858585',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};

const CENTER_BLOCK_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const CENTER_BLOCK_FULL_HEIGHT_STYLE: React.CSSProperties = {
  ...CENTER_BLOCK_STYLE,
  height: '100%',
};

const EMPTY_TEXT_STYLE: React.CSSProperties = {
  textAlign: 'center',
  color: '#858585',
};

const EMPTY_ICON_STYLE: React.CSSProperties = {
  fontSize: '48px',
  marginBottom: '16px',
};

const EMPTY_HINT_STYLE: React.CSSProperties = {
  fontSize: '12px',
  marginTop: '8px',
};

interface HistoryViewProps {
  historyData: HistoryData | null;
  currentProvider?: string; // Current provider (claude or codex)
  onLoadSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void; // Delete session callback
  onDeleteSessions: (sessionIds: string[]) => void; // Batch delete sessions callback
  onExportSession: (sessionId: string, title: string) => void; // Export session callback
  onToggleFavorite: (sessionId: string) => void; // Toggle favorite callback
  onUpdateTitle: (sessionId: string, newTitle: string) => void; // Update title callback
}

const formatTimeAgo = (timestamp: string | undefined, t: (key: string) => string) => {
  if (!timestamp) {
    return '';
  }
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  const units: [number, string][] = [
    [31536000, t('history.timeAgo.yearsAgo')],
    [2592000, t('history.timeAgo.monthsAgo')],
    [86400, t('history.timeAgo.daysAgo')],
    [3600, t('history.timeAgo.hoursAgo')],
    [60, t('history.timeAgo.minutesAgo')],
  ];

  for (const [unitSeconds, label] of units) {
    const interval = Math.floor(seconds / unitSeconds);
    if (interval >= 1) {
      return `${interval} ${label}`;
    }
  }
  return `${Math.max(seconds, 1)} ${t('history.timeAgo.secondsAgo')}`;
};

const getComparableTimestamp = (timestamp: string | undefined) => {
  if (!timestamp) {
    return 0;
  }
  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
};

const formatFileSize = (bytes: number | undefined): { text: string; isMB: boolean } => {
  if (!bytes || bytes === 0) {
    return { text: '0 KB', isMB: false };
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return { text: `${kb.toFixed(1)} KB`, isMB: false };
  }
  const mb = kb / 1024;
  return { text: `${mb.toFixed(1)} MB`, isMB: true };
};

const deduplicateHistorySessions = (sessions: HistorySessionSummary[]) => {
  const deduplicated = new Map<string, HistorySessionSummary>();

  for (const session of sessions) {
    if (!session?.sessionId) {
      continue;
    }

    const existing = deduplicated.get(session.sessionId);
    if (!existing) {
      deduplicated.set(session.sessionId, session);
      continue;
    }

    const existingTs = getComparableTimestamp(existing.lastTimestamp);
    const incomingTs = getComparableTimestamp(session.lastTimestamp);
    const preferred = incomingTs >= existingTs ? session : existing;
    const fallback = preferred === session ? existing : session;

    deduplicated.set(session.sessionId, {
      ...preferred,
      title: preferred.title || fallback.title,
      messageCount: Math.max(preferred.messageCount || 0, fallback.messageCount || 0),
      isFavorited: preferred.isFavorited || fallback.isFavorited,
      favoritedAt: Math.max(preferred.favoritedAt || 0, fallback.favoritedAt || 0) || undefined,
      provider: preferred.provider || fallback.provider,
    });
  }

  return Array.from(deduplicated.values());
};

// Highlight matching text within a label
const highlightText = (text: string, query: string) => {
  if (!query.trim()) {
    return <span>{text}</span>;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    return <span>{text}</span>;
  }

  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);

  return (
    <span>
      {before}
      <mark style={HIGHLIGHT_MARK_STYLE}>{match}</mark>
      {after}
    </span>
  );
};

const stopPropagationHandler = (e: React.MouseEvent) => {
  e.stopPropagation();
};

interface HistoryItemProps {
  session: HistorySessionSummary;
  isEditing: boolean;
  isSelected: boolean;
  isSelectionMode: boolean;
  isCopied: boolean;
  isCopyFailed: boolean;
  editingTitle: string;
  searchQuery: string;
  t: TFunction;
  onItemClick: (session: HistorySessionSummary, isEditing: boolean) => void;
  onSelectionToggle: (sessionId: string) => void;
  onEditStart: (sessionId: string, currentTitle: string) => void;
  onEditSave: (sessionId: string, title: string) => void;
  onEditCancel: () => void;
  onEditTitleChange: (value: string) => void;
  onExport: (sessionId: string, title: string) => void;
  onDelete: (sessionId: string) => void;
  onFavorite: (sessionId: string) => void;
  onCopySessionId: (sessionId: string) => void;
}

const HistoryItem = memo(({
  session,
  isEditing,
  isSelected,
  isSelectionMode,
  isCopied,
  isCopyFailed,
  editingTitle,
  searchQuery,
  t,
  onItemClick,
  onSelectionToggle,
  onEditStart,
  onEditSave,
  onEditCancel,
  onEditTitleChange,
  onExport,
  onDelete,
  onFavorite,
  onCopySessionId,
}: HistoryItemProps) => {
  const handleRowClick = useCallback(() => {
    onItemClick(session, isEditing);
  }, [onItemClick, session, isEditing]);

  const handleCheckboxChange = useCallback(() => {
    onSelectionToggle(session.sessionId);
  }, [onSelectionToggle, session.sessionId]);

  const handleEditStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onEditStart(session.sessionId, session.title);
  }, [onEditStart, session.sessionId, session.title]);

  const handleEditSave = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    onEditSave(session.sessionId, editingTitle);
  }, [onEditSave, session.sessionId, editingTitle]);

  const handleEditCancel = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    onEditCancel();
  }, [onEditCancel]);

  const handleEditChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onEditTitleChange(e.target.value);
  }, [onEditTitleChange]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleEditSave(e);
    } else if (e.key === 'Escape') {
      handleEditCancel(e);
    }
  }, [handleEditSave, handleEditCancel]);

  const handleExport = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onExport(session.sessionId, session.title);
  }, [onExport, session.sessionId, session.title]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(session.sessionId);
  }, [onDelete, session.sessionId]);

  const handleFavorite = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onFavorite(session.sessionId);
  }, [onFavorite, session.sessionId]);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onCopySessionId(session.sessionId);
  }, [onCopySessionId, session.sessionId]);

  const fileSize = session.fileSize ? formatFileSize(session.fileSize) : null;

  return (
    <div
      className={`history-item ${isSelectionMode ? 'selection-mode' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={handleRowClick}
    >
      <div className="history-item-header">
        {isSelectionMode && (
          <label
            className="history-selection-checkbox-wrapper"
            onClick={stopPropagationHandler}
            title={t('history.selectSession')}
          >
            <input
              type="checkbox"
              className="history-selection-checkbox"
              checked={isSelected}
              onChange={handleCheckboxChange}
              onClick={stopPropagationHandler}
              aria-label={t('history.selectSessionWithTitle', { title: extractCommandMessageContent(session.title) })}
            />
          </label>
        )}
        <div className="history-item-title">
          {/* Provider Logo */}
          {session.provider && (
            <span
              className="history-provider-badge"
              style={PROVIDER_BADGE_STYLE}
              title={session.provider === 'claude' ? 'Claude' : 'Codex'}
            >
              <ProviderModelIcon providerId={session.provider} size={20} colored />
            </span>
          )}
          {isEditing ? (
            <div className="history-title-edit-mode" onClick={stopPropagationHandler}>
              <input
                type="text"
                className="history-title-input"
                value={editingTitle}
                onChange={handleEditChange}
                maxLength={50}
                autoFocus
                onKeyDown={handleEditKeyDown}
              />
              <button
                className="history-title-save-btn"
                onClick={handleEditSave}
                title={t('history.saveTitleButton')}
              >
                <span className="codicon codicon-check"></span>
              </button>
              <button
                className="history-title-cancel-btn"
                onClick={handleEditCancel}
                title={t('history.cancelEditButton')}
              >
                <span className="codicon codicon-close"></span>
              </button>
            </div>
          ) : (
            highlightText(extractCommandMessageContent(session.title), searchQuery)
          )}
        </div>
        <div className="history-item-time">{formatTimeAgo(session.lastTimestamp, t)}</div>
        {!isEditing && !isSelectionMode && (
          <div className={`history-action-buttons ${session.isFavorited ? 'has-favorite' : ''}`}>
            <button
              className="history-edit-btn"
              onClick={handleEditStart}
              title={t('history.editTitle')}
              aria-label={t('history.editTitle')}
            >
              <span className="codicon codicon-edit"></span>
            </button>
            <button
              className="history-export-btn"
              onClick={handleExport}
              title={t('history.exportSession')}
              aria-label={t('history.exportSession')}
            >
              <span className="codicon codicon-arrow-down"></span>
            </button>
            <button
              className="history-delete-btn"
              onClick={handleDelete}
              title={t('history.deleteSession')}
              aria-label={t('history.deleteSession')}
            >
              <span className="codicon codicon-trash"></span>
            </button>
            <button
              className={`history-favorite-btn ${session.isFavorited ? 'favorited' : ''}`}
              onClick={handleFavorite}
              title={session.isFavorited ? t('history.unfavoriteSession') : t('history.favoriteSession')}
              aria-label={session.isFavorited ? t('history.unfavoriteSession') : t('history.favoriteSession')}
            >
              <span className={session.isFavorited ? 'codicon codicon-star-full' : 'codicon codicon-star-empty'}></span>
            </button>
          </div>
        )}
      </div>
      <div className="history-item-meta">
        <span>{t('history.messageCount', { count: session.messageCount })}</span>
        {fileSize && (
          <>
            <span className="history-meta-dot">•</span>
            <span className={fileSize.isMB ? 'history-filesize-large' : ''}>{fileSize.text}</span>
          </>
        )}
        <span className="history-meta-dot">•</span>
        <div className="history-session-id-container">
          <span
            className="history-session-id"
            title={session.sessionId}
          >
            {session.sessionId.slice(0, 8)}
          </span>
          <button
            className={`history-copy-id-btn ${isCopied ? 'copied' : ''} ${isCopyFailed ? 'failed' : ''}`}
            onClick={handleCopy}
            title={isCopied ? t('history.sessionIdCopied') : isCopyFailed ? t('history.copyFailed') : t('history.copySessionId')}
            aria-label={t('history.copySessionId')}
          >
            <span className={`codicon ${isCopied ? 'codicon-check' : isCopyFailed ? 'codicon-error' : 'codicon-copy'}`}></span>
          </button>
        </div>
      </div>
    </div>
  );
});

HistoryItem.displayName = 'HistoryItem';

const HistoryView = ({ historyData, currentProvider, onLoadSession, onDeleteSession, onDeleteSessions, onExportSession, onToggleFavorite, onUpdateTitle }: HistoryViewProps) => {
  const { t } = useTranslation();
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight || 600);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null); // Session ID pending deletion
  const [inputValue, setInputValue] = useState(''); // Immediate value of search input
  const [searchQuery, setSearchQuery] = useState(''); // Actual search keyword (debounced)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null); // Session ID being edited
  const [editingTitle, setEditingTitle] = useState(''); // Title content being edited
  const [isDeepSearching, setIsDeepSearching] = useState(false); // Deep search in-progress state
  const deepSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Deep search timeout timer
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Copy status timeout timer
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null); // Track which session ID was copied
  const [copyFailedSessionId, setCopyFailedSessionId] = useState<string | null>(null); // Track which session ID copy failed
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set());
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);

  // Clean up all timeout timers on unmount
  useEffect(() => {
    return () => {
      if (deepSearchTimeoutRef.current) {
        clearTimeout(deepSearchTimeoutRef.current);
        deepSearchTimeoutRef.current = null;
      }
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleResize = () => setViewportHeight(window.innerHeight || 600);
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Debounce: update search keyword 300ms after input stops
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  // When historyData updates, stop deep search state and clean up timeout timer
  // Uses functional update to avoid isDeepSearching dependency while cleaning up the corresponding timeout
  useEffect(() => {
    if (historyData) {
      setIsDeepSearching(prev => {
        if (prev && deepSearchTimeoutRef.current) {
          clearTimeout(deepSearchTimeoutRef.current);
          deepSearchTimeoutRef.current = null;
        }
        return false;
      });
    }
  }, [historyData]);

  // Sort and filter sessions: favorited on top (by favorite time descending), unfavorited below (original order)
  const sessions = useMemo(() => {
    const rawSessions = deduplicateHistorySessions(historyData?.sessions ?? []);

    // Search filter (case-insensitive)
    const filteredSessions = searchQuery.trim()
      ? rawSessions.filter(s =>
          s.title?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : rawSessions;

    // Separate favorited and unfavorited sessions
    const favorited = filteredSessions.filter(s => s.isFavorited);
    const unfavorited = filteredSessions.filter(s => !s.isFavorited);

    // Sort favorited sessions by favorite time descending
    favorited.sort((a, b) => (b.favoritedAt || 0) - (a.favoritedAt || 0));

    // Merge: favorited first, unfavorited after
    return [...favorited, ...unfavorited];
  }, [historyData?.sessions, searchQuery]);

  const infoBar = useMemo(() => {
    if (!historyData) {
      return '';
    }
    const sessionCount = sessions.length;
    const messageCount = historyData.total ?? 0;
    return t('history.totalSessions', { count: sessionCount, total: messageCount });
  }, [historyData, sessions.length, t]);

  const selectedCount = selectedSessionIds.size;
  const allVisibleSelected = sessions.length > 0 && sessions.every(session => selectedSessionIds.has(session.sessionId));

  useEffect(() => {
    setSelectedSessionIds(prev => {
      if (prev.size === 0) {
        return prev;
      }

      const visibleSessionIds = new Set(sessions.map(session => session.sessionId));
      const next = new Set(Array.from(prev).filter(sessionId => visibleSessionIds.has(sessionId)));
      return next.size === prev.size ? prev : next;
    });
  }, [sessions]);

  const enterSelectionMode = useCallback(() => {
    setIsSelectionMode(true);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedSessionIds(new Set());
    setIsDeletingSelected(false);
  }, []);

  const toggleSessionSelection = useCallback((sessionId: string) => {
    setSelectedSessionIds(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedSessionIds(prev => {
      if (sessions.length > 0 && sessions.every(session => prev.has(session.sessionId))) {
        return new Set();
      }
      return new Set(sessions.map(session => session.sessionId));
    });
  }, [sessions]);

  const handleDeleteRequest = useCallback((sessionId: string) => {
    setDeletingSessionId(sessionId);
  }, []);

  const handleExportRequest = useCallback((sessionId: string, title: string) => {
    onExportSession(sessionId, title);
  }, [onExportSession]);

  const handleFavoriteRequest = useCallback((sessionId: string) => {
    onToggleFavorite(sessionId);
  }, [onToggleFavorite]);

  const confirmDelete = useCallback(() => {
    if (deletingSessionId) {
      onDeleteSession(deletingSessionId);
      setDeletingSessionId(null);
    }
  }, [deletingSessionId, onDeleteSession]);

  const confirmDeleteSelected = useCallback(() => {
    if (selectedSessionIds.size === 0) {
      setIsDeletingSelected(false);
      return;
    }

    onDeleteSessions(Array.from(selectedSessionIds));
    exitSelectionMode();
  }, [selectedSessionIds, onDeleteSessions, exitSelectionMode]);

  const cancelDelete = useCallback(() => {
    setDeletingSessionId(null);
  }, []);

  const handleEditStart = useCallback((sessionId: string, currentTitle: string) => {
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle);
  }, []);

  const handleEditSave = useCallback((sessionId: string, title: string) => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return; // Title cannot be empty
    }

    if (trimmedTitle.length > 50) {
      return;
    }

    onUpdateTitle(sessionId, trimmedTitle);
    setEditingSessionId(null);
    setEditingTitle('');
  }, [onUpdateTitle]);

  const handleEditCancel = useCallback(() => {
    setEditingSessionId(null);
    setEditingTitle('');
  }, []);

  const handleCopySessionId = useCallback(async (sessionId: string) => {
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = null;
    }
    const success = await copyToClipboard(sessionId);
    if (success) {
      setCopiedSessionId(sessionId);
      setCopyFailedSessionId(null);
    } else {
      setCopyFailedSessionId(sessionId);
      setCopiedSessionId(null);
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopiedSessionId(null);
      setCopyFailedSessionId(null);
      copyTimeoutRef.current = null;
    }, 2000);
  }, []);

  const handleItemClick = useCallback((session: HistorySessionSummary, isEditing: boolean) => {
    if (isSelectionMode) {
      toggleSessionSelection(session.sessionId);
      return;
    }
    if (!isEditing) {
      onLoadSession(session.sessionId);
    }
  }, [isSelectionMode, toggleSessionSelection, onLoadSession]);

  const handleDeepSearch = useCallback(() => {
    setIsDeepSearching(prev => {
      if (prev) return prev;
      sendBridgeEvent('deep_search_history', currentProvider || 'claude');

      if (deepSearchTimeoutRef.current) {
        clearTimeout(deepSearchTimeoutRef.current);
      }

      deepSearchTimeoutRef.current = setTimeout(() => {
        setIsDeepSearching(false);
        deepSearchTimeoutRef.current = null;
      }, DEEP_SEARCH_TIMEOUT_MS);
      return true;
    });
  }, [currentProvider]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  }, []);

  const handleStartDeleteSelected = useCallback(() => {
    setIsDeletingSelected(true);
  }, []);

  const handleCancelDeleteSelected = useCallback(() => {
    setIsDeletingSelected(false);
  }, []);

  if (!historyData) {
    return (
      <div className="messages-container" style={CENTER_BLOCK_STYLE}>
        <div style={EMPTY_TEXT_STYLE}>
          <div style={SPINNER_STYLE}></div>
          <div>{t('history.loading')}</div>
        </div>
      </div>
    );
  }

  if (!historyData.success) {
    return (
      <div className="messages-container" style={CENTER_BLOCK_STYLE}>
        <div style={EMPTY_TEXT_STYLE}>
          <div style={EMPTY_ICON_STYLE}>⚠️</div>
          <div>{historyData.error ?? t('history.loadFailed')}</div>
        </div>
      </div>
    );
  }

  // Render empty state (no search results or no sessions)
  const renderEmptyState = () => {
    // If search returned no results
    if (searchQuery.trim() && sessions.length === 0) {
      return (
        <div className="messages-container" style={CENTER_BLOCK_FULL_HEIGHT_STYLE}>
          <div style={EMPTY_TEXT_STYLE}>
            <div style={EMPTY_ICON_STYLE}>🔍</div>
            <div>{t('history.noSearchResults')}</div>
            <div style={EMPTY_HINT_STYLE}>{t('history.tryOtherKeywords')}</div>
          </div>
        </div>
      );
    }

    // If there are no sessions at all
    if (!searchQuery.trim() && sessions.length === 0) {
      return (
        <div className="messages-container" style={CENTER_BLOCK_FULL_HEIGHT_STYLE}>
          <div style={EMPTY_TEXT_STYLE}>
            <div style={EMPTY_ICON_STYLE}>📭</div>
            <div>{t('history.noSessions')}</div>
            <div style={EMPTY_HINT_STYLE}>{t('history.noSessionsDesc')}</div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderHistoryItem = (session: HistorySessionSummary) => (
    <HistoryItem
      key={`${session.sessionId}-${session.lastTimestamp ?? '0'}`}
      session={session}
      isEditing={editingSessionId === session.sessionId}
      isSelected={selectedSessionIds.has(session.sessionId)}
      isSelectionMode={isSelectionMode}
      isCopied={copiedSessionId === session.sessionId}
      isCopyFailed={copyFailedSessionId === session.sessionId}
      editingTitle={editingSessionId === session.sessionId ? editingTitle : ''}
      searchQuery={searchQuery}
      t={t}
      onItemClick={handleItemClick}
      onSelectionToggle={toggleSessionSelection}
      onEditStart={handleEditStart}
      onEditSave={handleEditSave}
      onEditCancel={handleEditCancel}
      onEditTitleChange={setEditingTitle}
      onExport={handleExportRequest}
      onDelete={handleDeleteRequest}
      onFavorite={handleFavoriteRequest}
      onCopySessionId={handleCopySessionId}
    />
  );

  const listHeight = Math.max(240, viewportHeight - 118);

  return (
    <div style={ROOT_STYLE}>
      <div className="history-header">
        <div className="history-header-main">
          {isSelectionMode ? (
            <div className="history-selection-summary">
              {t('history.selectedSessions', { count: selectedCount })}
            </div>
          ) : (
            <div className="history-info">{infoBar}</div>
          )}
          <div className="history-header-actions">
            {isSelectionMode ? (
              <>
                <button
                  className="history-toolbar-btn"
                  onClick={toggleSelectAllVisible}
                  disabled={sessions.length === 0}
                  title={allVisibleSelected ? t('history.clearSelection') : t('history.selectAll')}
                  aria-label={allVisibleSelected ? t('history.clearSelection') : t('history.selectAll')}
                >
                  <span className={`codicon ${allVisibleSelected ? 'codicon-clear-all' : 'codicon-check-all'}`}></span>
                  <span>{allVisibleSelected ? t('history.clearSelection') : t('history.selectAll')}</span>
                </button>
                <button
                  className="history-toolbar-btn history-toolbar-danger"
                  onClick={handleStartDeleteSelected}
                  disabled={selectedCount === 0}
                  title={t('history.deleteSelected')}
                  aria-label={t('history.deleteSelected')}
                >
                  <span className="codicon codicon-trash"></span>
                  <span>{t('history.deleteSelected')}</span>
                </button>
                <button
                  className="history-toolbar-btn"
                  onClick={exitSelectionMode}
                  title={t('history.exitSelectMode')}
                  aria-label={t('history.exitSelectMode')}
                >
                  <span className="codicon codicon-close"></span>
                </button>
              </>
            ) : (
              <>
                <button
                  className="history-toolbar-btn"
                  onClick={enterSelectionMode}
                  title={t('history.selectMode')}
                  aria-label={t('history.selectMode')}
                >
                  <span className="codicon codicon-checklist"></span>
                  <span>{t('history.selectMode')}</span>
                </button>
                {/* Deep search button */}
                <button
                  className={`history-deep-search-btn ${isDeepSearching ? 'searching' : ''}`}
                  onClick={handleDeepSearch}
                  disabled={isDeepSearching}
                  title={t('history.deepSearchTooltip')}
                >
                  <span className={`codicon ${isDeepSearching ? 'codicon-sync codicon-modifier-spin' : 'codicon-refresh'}`}></span>
                </button>
              </>
            )}
          </div>
        </div>
        {!isSelectionMode && (
          <div className="history-search-container">
            <input
              type="text"
              className="history-search-input"
              placeholder={t('history.searchPlaceholder')}
              value={inputValue}
              onChange={handleInputChange}
            />
            <span
              className="codicon codicon-search history-search-icon"
            ></span>
          </div>
        )}
        </div>
      <div style={LIST_WRAPPER_STYLE}>
        {sessions.length > 0 ? (
          <VirtualList
            items={sessions}
            itemHeight={78}
            height={listHeight}
            renderItem={renderHistoryItem}
            getItemKey={(session) => `${session.sessionId}-${session.lastTimestamp ?? '0'}`}
            className="messages-container"
          />
        ) : (
          renderEmptyState()
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deletingSessionId && (
        <div className="modal-overlay" onClick={cancelDelete} role="presentation">
          <div className="modal-content" onClick={stopPropagationHandler}>
            <h3>{t('history.confirmDelete')}</h3>
            <p>{t('history.deleteMessage')}</p>
            <div className="modal-actions">
              <button className="modal-btn modal-btn-cancel" onClick={cancelDelete}>
                {t('common.cancel')}
              </button>
              <button className="modal-btn modal-btn-danger" onClick={confirmDelete}>
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeletingSelected && (
        <div className="modal-overlay" onClick={handleCancelDeleteSelected} role="presentation">
          <div className="modal-content" onClick={stopPropagationHandler} role="dialog" aria-modal="true" aria-labelledby="delete-selected-title">
            <h3 id="delete-selected-title">{t('history.confirmDeleteSelected')}</h3>
            <p>{t('history.deleteSelectedMessage', { count: selectedCount })}</p>
            <div className="modal-actions">
              <button className="modal-btn modal-btn-cancel" onClick={handleCancelDeleteSelected}>
                {t('common.cancel')}
              </button>
              <button className="modal-btn modal-btn-danger" onClick={confirmDeleteSelected}>
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryView;
