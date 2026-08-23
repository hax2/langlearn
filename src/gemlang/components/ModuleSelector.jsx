import { useEffect, useMemo, useRef, useState } from 'react';
import './ModuleSelector.css';

const DISCOVERY_STORAGE_KEY = 'gemlang-module-discovery';

const loadDiscoveryState = () => {
  try {
    return JSON.parse(sessionStorage.getItem(DISCOVERY_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
};

const STATUS_BADGES = {
  'completed': { icon: '✓', label: 'Completed', className: 'status-completed' },
  'needs-refresh': { icon: '↻', label: 'Refresh', className: 'status-refresh' },
  'in-progress': { icon: '▶', label: 'In Progress', className: 'status-in-progress' },
};

const ModuleSelector = ({
  modules,
  onSelect,
  practiceMode,
  onPracticeModeChange,
  getModuleStatus,
  getModuleProgress,
  onBack,
  hasPremiumAccess,
  isModuleFree,
}) => {
  const [initialDiscovery] = useState(loadDiscoveryState);
  const [searchQuery, setSearchQuery] = useState(initialDiscovery.searchQuery || '');
  const [levelFilter, setLevelFilter] = useState(initialDiscovery.levelFilter || 'all');
  const [typeFilter, setTypeFilter] = useState(initialDiscovery.typeFilter || 'all');
  const [statusFilter, setStatusFilter] = useState(initialDiscovery.statusFilter || 'all');
  const searchInputRef = useRef(null);
  const isPureTesting = practiceMode === 'testing';

  useEffect(() => {
    try {
      sessionStorage.setItem(DISCOVERY_STORAGE_KEY, JSON.stringify({
        searchQuery,
        levelFilter,
        typeFilter,
        statusFilter,
      }));
    } catch {
      // Discovery still works when session storage is unavailable.
    }
  }, [levelFilter, searchQuery, statusFilter, typeFilter]);

  useEffect(() => {
    const focusSearch = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      if (event.key === '/' && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const levels = useMemo(
    () => [...new Set(modules.map((module) => module.level).filter(Boolean))],
    [modules]
  );

  const normalizeSearchText = (value) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();

  const visibleModules = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery.trim());

    return modules.filter((module) => {
      const status = getModuleStatus ? getModuleStatus(module.id) : 'not-started';
      const type = module.type || 'lesson';
      const searchableText = normalizeSearchText(
        `${module.title} ${module.description} ${module.level}`
      );

      return (
        (!normalizedQuery || searchableText.includes(normalizedQuery)) &&
        (levelFilter === 'all' || module.level === levelFilter) &&
        (typeFilter === 'all' || type === typeFilter) &&
        (statusFilter === 'all' || status === statusFilter)
      );
    });
  }, [getModuleStatus, levelFilter, modules, searchQuery, statusFilter, typeFilter]);

  const hasActiveFilters = Boolean(searchQuery) ||
    levelFilter !== 'all' ||
    typeFilter !== 'all' ||
    statusFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setLevelFilter('all');
    setTypeFilter('all');
    setStatusFilter('all');
  };

  const getButtonLabel = (status) => {
    if (isPureTesting) return 'Start Testing';
    switch (status) {
      case 'in-progress': return 'Continue';
      case 'completed': return 'Review';
      case 'needs-refresh': return 'Refresh';
      default: return 'Start Learning';
    }
  };

  return (
    <div className="module-selector">
      <div className="module-header">
        <div className="module-header-top">
          {onBack && (
            <button className="btn-secondary btn-sm" onClick={onBack}>
              ← Dashboard
            </button>
          )}
        </div>
        <h1 className="module-main-title">All Modules</h1>
        <p className="module-subtitle">
          {isPureTesting
            ? 'Choose a module to run pure translation testing (English to Spanish only).'
            : 'Choose a module to start guided listening and translation practice.'}
        </p>
        <div className="practice-mode-panel glass-panel">
          <p className="practice-mode-title">Practice Mode</p>
          <div className="practice-mode-toggle" role="group" aria-label="Practice mode">
            <button
              type="button"
              className={`practice-mode-btn ${practiceMode === 'guided' ? 'active' : ''}`}
              onClick={() => onPracticeModeChange('guided')}
              aria-pressed={practiceMode === 'guided'}
            >
              Guided Learning
            </button>
            <button
              type="button"
              className={`practice-mode-btn ${isPureTesting ? 'active' : ''}`}
              onClick={() => onPracticeModeChange('testing')}
              aria-pressed={isPureTesting}
            >
              Pure Testing
            </button>
          </div>
        </div>
      </div>

      <section className="module-discovery glass-panel" aria-label="Find a module">
        <div className="module-search-wrapper">
          <svg className="module-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={searchInputRef}
            className="module-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search topics, grammar, or chapters"
            aria-label="Search modules"
          />
          {!searchQuery && <kbd className="module-search-shortcut" aria-hidden="true">/</kbd>}
        </div>

        <div className="module-filter-row">
          <label className="module-filter">
            <span>Level</span>
            <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
              <option value="all">All levels</option>
              {levels.map((level) => <option value={level} key={level}>{level}</option>)}
            </select>
          </label>
          <label className="module-filter">
            <span>Type</span>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">All types</option>
              <option value="lesson">Lessons</option>
              <option value="story">Stories</option>
              <option value="review">Reviews</option>
            </select>
          </label>
          <label className="module-filter">
            <span>Progress</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Any progress</option>
              <option value="not-started">Not started</option>
              <option value="in-progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="needs-refresh">Needs refresh</option>
            </select>
          </label>
        </div>

        <div className="module-results-summary" aria-live="polite">
          <span>
            Showing <strong>{visibleModules.length}</strong> of {modules.length} modules
          </span>
          {hasActiveFilters && (
            <button type="button" className="module-clear-filters" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </section>

      <div className="module-grid">
        {visibleModules.map((mod, index) => {
          const status = getModuleStatus ? getModuleStatus(mod.id) : 'not-started';
          const prog = getModuleProgress ? getModuleProgress(mod.id) : null;
          const badge = STATUS_BADGES[status];
          const isStory = mod.type === 'story';
          const isReview = mod.type === 'review';
          const isLocked = !hasPremiumAccess && !isModuleFree(mod.id);

          return (
            <button
              type="button"
              key={mod.id} 
              className={`module-card glass-panel ${status !== 'not-started' ? 'has-progress' : ''} ${isStory ? 'story-card' : ''} ${isReview ? 'review-card' : ''} ${isLocked ? 'is-locked' : ''}`}
              onClick={() => onSelect(mod)}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="module-card-content">
                <div className="module-card-top-row">
                  <span className="module-level">{mod.level}</span>
                  <div className="module-badges-row">
                    {isLocked && (
                      <span className="module-status-badge status-pro">
                        ✦ Pro
                      </span>
                    )}
                    {isStory && (
                      <span className="module-status-badge status-story">
                        📖 Story
                      </span>
                    )}
                    {isReview && (
                      <span className="module-status-badge status-review">
                        🔄 Review
                      </span>
                    )}
                    {badge && (
                      <span className={`module-status-badge ${badge.className}`}>
                        {badge.icon} {badge.label}
                      </span>
                    )}
                  </div>
                </div>
                <h2 className="module-title">{mod.title}</h2>
                <p className="module-description">{mod.description}</p>
                
                {/* Progress bar for modules with progress */}
                {prog && prog.percentage > 0 && (
                  <div className="module-progress-bar-wrapper">
                    <div
                      className="module-progress-bar"
                      role="progressbar"
                      aria-label={`${mod.title} progress`}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={prog.percentage}
                    >
                      <div
                        className={`module-progress-fill ${status === 'completed' ? 'fill-complete' : status === 'needs-refresh' ? 'fill-refresh' : ''}`}
                        style={{ width: `${prog.percentage}%` }}
                      />
                    </div>
                    <span className="module-progress-label">{prog.percentage}%</span>
                  </div>
                )}

                <div className="module-meta">
                  <span className="sentence-count">
                    {mod.sentenceCount} {isPureTesting ? 'Prompts' : 'Sentences'}
                  </span>
                  <span className="btn-primary btn-sm module-card-action">
                    {isLocked ? 'Unlock' : getButtonLabel(status)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {visibleModules.length === 0 && (
        <div className="module-empty-state glass-panel">
          <span className="module-empty-icon" aria-hidden="true">⌕</span>
          <h2>No matching modules</h2>
          <p>Try a broader search or clear a filter to see more lessons.</p>
          <button type="button" className="btn-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
};

export default ModuleSelector;
