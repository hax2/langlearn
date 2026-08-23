import React from 'react';
import './Dashboard.css';

const Dashboard = ({
  modules,
  stats,
  progress,
  getModuleStatus,
  getModuleProgress,
  getNextSuggestedModule,
  getRefreshModules,
  onSelectModule,
  onBrowseAll,
  hasPremiumAccess,
  isModuleFree,
  onUpgrade,
}) => {
  const suggestedModule = getNextSuggestedModule();
  const refreshModules = getRefreshModules();
  const lastModuleId = progress.lastModuleId;
  const lastModule = lastModuleId ? modules.find((m) => m.id === lastModuleId) : null;
  const lastStatus = lastModule ? getModuleStatus(lastModule.id) : null;
  const isResuming = lastStatus === 'in-progress';
  const completionPercentage = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;

  // Find recently completed modules (last 3)
  const recentlyCompleted = modules
    .filter((m) => {
      const status = getModuleStatus(m.id);
      return status === 'completed';
    })
    .sort((a, b) => {
      const aTime = progress.modules[a.id]?.completedAt || '';
      const bTime = progress.modules[b.id]?.completedAt || '';
      return bTime.localeCompare(aTime); // newest first
    })
    .slice(0, 3);

  const heroAction = isResuming ? lastModule : suggestedModule;
  const heroLabel = isResuming
    ? 'Continue Learning'
    : suggestedModule
      ? (getModuleStatus(suggestedModule.id) === 'needs-refresh' ? 'Refresh Module' : 'Start Next Module')
      : null;

  return (
    <div className="dashboard animate-fade-in">
      {/* Hero Section */}
      <div className="dashboard-hero">
        <h1 className="dashboard-title">Welcome back</h1>
        <dl className="dashboard-stats" aria-label="Learning progress">
          <div className="stat-item">
            <dt className="stat-label">Completed</dt>
            <dd className="stat-value">{stats.completed}</dd>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <dt className="stat-label">In Progress</dt>
            <dd className="stat-value">{stats.inProgress}</dd>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <dt className="stat-label">Total</dt>
            <dd className="stat-value">{stats.total}</dd>
          </div>
          <div className="stat-divider" />
          <div className="stat-item">
            <dt className="stat-label">Sentences</dt>
            <dd className="stat-value">{stats.totalSentencesPracticed.toLocaleString()}</dd>
          </div>
        </dl>
        {/* Overall progress bar */}
        <div className="dashboard-overall-progress">
          <div
            className="overall-progress-bar"
            role="progressbar"
            aria-label="Overall course completion"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={completionPercentage}
          >
            <div
              className="overall-progress-fill"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <span className="overall-progress-label">
            {completionPercentage}% complete
          </span>
        </div>
      </div>

      {!hasPremiumAccess && (
        <button type="button" className="dashboard-pro-banner glass-panel" onClick={onUpgrade}>
          <span className="dashboard-pro-icon" aria-hidden="true">✦</span>
          <span className="dashboard-pro-copy">
            <strong>Unlock the complete GemLang course</strong>
            <span>60 more lessons, stories, and reviews from beginner to advanced.</span>
          </span>
          <span className="btn-primary btn-sm">See Pro</span>
        </button>
      )}

      {/* Main CTA */}
      {heroAction && (
        <button
          type="button"
          className="dashboard-cta glass-panel"
          onClick={() => onSelectModule(heroAction)}
        >
          <div className="cta-content">
            {isResuming && (() => {
              const prog = getModuleProgress(heroAction.id);
              return (
                <div className="cta-progress-ring">
                  <svg viewBox="0 0 36 36" className="cta-ring-svg">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="3"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="url(#cta-gradient)"
                      strokeWidth="3"
                      strokeDasharray={`${prog.percentage}, 100`}
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="cta-gradient">
                        <stop offset="0%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#6366f1" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="cta-ring-text">{prog.percentage}%</span>
                </div>
              );
            })()}
            <div className="cta-text">
              <span className="cta-module-level">{heroAction.level}</span>
              {!hasPremiumAccess && !isModuleFree(heroAction.id) && (
                <span className="cta-pro-label">✦ Pro</span>
              )}
              <h2 className="cta-module-title">{heroAction.title}</h2>
              <p className="cta-module-desc">{heroAction.description}</p>
              {isResuming && (() => {
                const prog = getModuleProgress(heroAction.id);
                return (
                  <span className="cta-resume-hint">
                    Sentence {prog.current} of {prog.total}
                  </span>
                );
              })()}
            </div>
          </div>
          <span className="btn-primary cta-button pulse-primary">
            {heroLabel} →
          </span>
        </button>
      )}

      {/* All done state */}
      {!heroAction && stats.completed === stats.total && stats.total > 0 && (
        <div className="dashboard-cta glass-panel dashboard-all-done">
          <div className="all-done-icon">🏆</div>
          <h2 className="cta-module-title">All modules completed!</h2>
          <p className="cta-module-desc">You've finished every module. Browse to review any lesson.</p>
        </div>
      )}

      {/* Needs Refresh Section */}
      {refreshModules.length > 0 && (
        <div className="dashboard-section">
          <h3 className="section-title">
            <span className="section-icon">🔄</span>
            Time to Refresh
          </h3>
          <div className="refresh-grid">
            {refreshModules.map((mod) => (
              <button
                type="button"
                key={mod.id}
                className="refresh-card glass-panel"
                onClick={() => onSelectModule(mod)}
              >
                <div className="refresh-card-info">
                  <span className="refresh-level">{mod.level}</span>
                  <h4 className="refresh-title">{mod.title}</h4>
                  <span className="refresh-confidence">
                    {progress.modules[mod.id]?.confidence === 'needsRefresh'
                      ? '😬 Needs practice'
                      : '🤔 Getting there'}
                  </span>
                </div>
                <span
                  className="btn-secondary btn-sm refresh-btn"
                >
                  ↻ Refresh
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recently Completed */}
      {recentlyCompleted.length > 0 && (
        <div className="dashboard-section">
          <h3 className="section-title">
            <span className="section-icon">✅</span>
            Recently Completed
          </h3>
          <div className="refresh-grid">
            {recentlyCompleted.map((mod) => (
              <button
                type="button"
                key={mod.id}
                className="refresh-card glass-panel completed-card"
                onClick={() => onSelectModule(mod)}
              >
                <div className="refresh-card-info">
                  <span className="refresh-level">{mod.level}</span>
                  <h4 className="refresh-title">{mod.title}</h4>
                  <span className="completed-badge">✓ Mastered</span>
                </div>
                <span
                  className="btn-secondary btn-sm refresh-btn"
                >
                  Review
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Browse All */}
      <div className="dashboard-browse">
        <button className="btn-secondary browse-all-btn" onClick={onBrowseAll}>
          Browse All Modules ({stats.total})
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
