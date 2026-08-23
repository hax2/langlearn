import { useCallback, useRef, useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import ModuleSelector from './components/ModuleSelector';
import LessonPlayer from './components/LessonPlayer';
import SettingsPanel from './components/SettingsPanel';
import Onboarding from './components/Onboarding';
import Auth from './components/Auth';
import PricingModal from './components/PricingModal';
import LegalModal from './components/LegalModal';
import { supabase } from './supabaseClient';
import useSettings from './hooks/useSettings';
import useProgress from './hooks/useProgress';
import useSubscription from './hooks/useSubscription';
import { isModuleFree } from './config/monetization';
import modulesManifest from './data/modules-manifest.json';
import './App.css';

const moduleLoaders = import.meta.glob('./data/modules/*.json');
const GUEST_MODE_KEY = 'gemlang-guest-mode';

const loadGuestMode = () => {
  try {
    return localStorage.getItem(GUEST_MODE_KEY) === 'true';
  } catch {
    return false;
  }
};

function App() {
  const [session, setSession] = useState(null);
  const [guestMode, setGuestMode] = useState(loadGuestMode);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [legalDocument, setLegalDocument] = useState(null);
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'modules' | 'settings' | 'lesson'
  const [previousView, setPreviousView] = useState('dashboard');
  const [lessonOriginView, setLessonOriginView] = useState('dashboard');
  const [activeModuleIndex, setActiveModuleIndex] = useState(null);
  const [activeModule, setActiveModule] = useState(null);
  const [isModuleLoading, setIsModuleLoading] = useState(false);
  const [moduleLoadError, setModuleLoadError] = useState(null);
  const [practiceMode, setPracticeMode] = useState(() => {
    try {
      const prog = JSON.parse(localStorage.getItem('gemlang-progress') || '{}');
      return prog.lastPracticeMode || 'guided';
    } catch { return 'guided'; }
  });
  const loadRequestRef = useRef(0);
  const accountButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const dialogCancelButtonRef = useRef(null);
  const { settings, updateSetting, resetSettings } = useSettings();
  const {
    subscription,
    hasPremiumAccess,
    isLoading: isSubscriptionLoading,
    error: subscriptionError,
    startCheckout,
    openBillingPortal,
  } = useSubscription(session);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        setGuestMode(false);
        try { localStorage.removeItem(GUEST_MODE_KEY); } catch { /* storage unavailable */ }
      }
      setIsInitializing(false);
    }).catch(() => {
      setIsInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        setGuestMode(false);
        try { localStorage.removeItem(GUEST_MODE_KEY); } catch { /* storage unavailable */ }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!showSignOutConfirm) return undefined;

    dialogCancelButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowSignOutConfirm(false);
        requestAnimationFrame(() => accountButtonRef.current?.focus());
        return;
      }

      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll('button:not(:disabled)');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSignOutConfirm]);

  const {
    progress,
    saveModuleProgress,
    completeModule,
    getModuleStatus,
    getModuleProgress,
    getNextSuggestedModule,
    getRefreshModules,
    stats,
    resetProgress,
    setStartingLevel,
  } = useProgress(modulesManifest);

  const loadModuleAtIndex = useCallback(async (index) => {
    const manifestModule = modulesManifest[index];
    if (!manifestModule) return;

    const loader = moduleLoaders[`./data/modules/${manifestModule.file}`];

    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setActiveModuleIndex(index);
    setActiveModule(null);
    setModuleLoadError(null);
    setIsModuleLoading(true);
    setView('lesson');

    try {
      if (!loader) {
        throw new Error(`Missing module loader for ${manifestModule.file}`);
      }
      const loadedModule = await loader();
      if (loadRequestRef.current !== requestId) return;
      setActiveModule(loadedModule.default);
    } catch (error) {
      if (loadRequestRef.current !== requestId) return;

      const errorMsg = error instanceof Error ? error.message : '';
      if (
        errorMsg.includes('Failed to fetch dynamically imported module') ||
        errorMsg.includes('Importing a module script failed') ||
        errorMsg.includes('error loading dynamically imported module')
      ) {
        console.warn('Dynamic import chunk load failure. Reloading to get latest assets...', error);
        window.location.reload();
        return;
      }

      setModuleLoadError(error instanceof Error ? error.message : 'Unable to load this module.');
    } finally {
      if (loadRequestRef.current === requestId) {
        setIsModuleLoading(false);
      }
    }
  }, []);

  const handleSelectModule = useCallback((module) => {
    if (!isModuleFree(module.id) && !hasPremiumAccess) {
      setShowPricing(true);
      return;
    }

    const idx = modulesManifest.findIndex((item) => item.id === module.id);
    if (idx >= 0) {
      setLessonOriginView(view === 'modules' ? 'modules' : 'dashboard');
      void loadModuleAtIndex(idx);
    }
  }, [hasPremiumAccess, loadModuleAtIndex, view]);

  const handleBackToDashboard = useCallback(() => {
    loadRequestRef.current += 1;
    setActiveModuleIndex(null);
    setActiveModule(null);
    setModuleLoadError(null);
    setIsModuleLoading(false);
    setView('dashboard');
  }, []);

  const handleBackFromLesson = useCallback(() => {
    loadRequestRef.current += 1;
    setActiveModuleIndex(null);
    setActiveModule(null);
    setModuleLoadError(null);
    setIsModuleLoading(false);
    setView(lessonOriginView);
  }, [lessonOriginView]);

  const handleNextModule = useCallback(() => {
    const nextIdx = activeModuleIndex + 1;
    if (nextIdx < modulesManifest.length) {
      void loadModuleAtIndex(nextIdx);
    } else {
      handleBackToDashboard();
    }
  }, [activeModuleIndex, handleBackToDashboard, loadModuleAtIndex]);

  /** Get the saved merged-items index for a module to support resume */
  const getSavedIndex = useCallback((moduleId) => {
    const mod = progress.modules[moduleId];
    if (!mod || !mod.currentIndex) return 0;
    // If the module was completed, start from the beginning (reviewing)
    if (mod.completedAt) return 0;
    // Return saved sentence-level progress — the LessonPlayer will convert this
    // to a merged-items index by counting sentence items
    return mod.currentIndex || 0;
  }, [progress]);

  /** Convert a sentence-level index to a merged-items index.
   *  This is passed to the LessonPlayer to calculate resume position. */
  const getSavedMergedIndex = useCallback((moduleId) => {
    const sentenceIndex = getSavedIndex(moduleId);
    if (sentenceIndex <= 0) return 0;
    // We can't easily pre-compute the merged index here since we don't have
    // the module data loaded yet. Instead, we just pass the sentence index
    // and let the LessonPlayer handle it.
    return sentenceIndex;
  }, [getSavedIndex]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const handleEnterGuestMode = useCallback(() => {
    setGuestMode(true);
    try { localStorage.setItem(GUEST_MODE_KEY, 'true'); } catch { /* storage unavailable */ }
  }, []);

  const handleExitGuestMode = useCallback(() => {
    setGuestMode(false);
    try { localStorage.removeItem(GUEST_MODE_KEY); } catch { /* storage unavailable */ }
  }, []);

  const closeSignOutConfirm = useCallback(() => {
    setShowSignOutConfirm(false);
    requestAnimationFrame(() => accountButtonRef.current?.focus());
  }, []);

  return (
    <div className="app-container animate-fade-in">
      <header className="app-header">
        <button
          type="button"
          className="app-logo"
          onClick={handleBackToDashboard}
          aria-label="Go to dashboard"
        >
          LangLearn
        </button>
        <div className="app-header-actions">
          {(session || guestMode) && (
            <button
              ref={accountButtonRef}
              type="button"
              className="header-action"
              onClick={() => setShowSignOutConfirm(true)}
              title={session ? "Sign Out" : "Sign In"}
              aria-label={session ? "Sign Out" : "Sign In"}
            >
              {session ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              )}
              <span className="header-action-label">{session ? 'Sign out' : 'Sign in'}</span>
            </button>
          )}
          {progress.hasChosenLevel && (
            <button
              type="button"
              className={`header-action ${view === 'settings' ? 'is-active' : ''}`}
              onClick={() => {
                if (view === 'settings') {
                  setView(previousView);
                } else {
                  setPreviousView(view);
                  setView('settings');
                }
              }}
              title="Settings"
              aria-label="Settings"
              aria-pressed={view === 'settings'}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span className="header-action-label">Settings</span>
            </button>
          )}
          {(session || guestMode) && (
            <button
              type="button"
              className={`header-action header-plan ${hasPremiumAccess ? 'is-pro' : ''}`}
              onClick={() => {
                if (hasPremiumAccess) {
                  setPreviousView(view);
                  setView('settings');
                } else {
                  setShowPricing(true);
                }
              }}
              title={hasPremiumAccess ? 'GemLang Pro billing' : 'Upgrade to GemLang Pro'}
              aria-label={hasPremiumAccess ? 'GemLang Pro billing' : 'Upgrade to GemLang Pro'}
            >
              <span aria-hidden="true">{hasPremiumAccess ? '✦' : '♦'}</span>
              <span className="header-action-label">
                {isSubscriptionLoading && session ? 'Checking…' : hasPremiumAccess ? 'Pro' : 'Upgrade'}
              </span>
            </button>
          )}
        </div>
      </header>

      <main className="main-content">
        {isInitializing ? (
          <div className="app-loading glass-panel" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <p>Loading LangLearn…</p>
          </div>
        ) : (!session && !guestMode) ? (
          <Auth onGuestMode={handleEnterGuestMode} />
        ) : !progress.hasChosenLevel ? (
          <Onboarding 
            modules={modulesManifest} 
            onComplete={(levelType, moduleId) => {
              let targetIndex = 0;
              if (levelType === 'granular' && moduleId) {
                targetIndex = modulesManifest.findIndex(m => m.id === moduleId);
              } else if (levelType === 'Intermediate') {
                targetIndex = modulesManifest.findIndex(m => m.level === 'Intermediate');
              } else if (levelType === 'Advanced') {
                targetIndex = modulesManifest.findIndex(m => m.level === 'Advanced');
              }
              
              const targetModule = targetIndex >= 0 ? modulesManifest[targetIndex] : modulesManifest[0];
              if (targetModule && !isModuleFree(targetModule.id) && !hasPremiumAccess) {
                setShowPricing(true);
                return;
              }

              setStartingLevel(levelType, moduleId);
              if (targetModule) {
                handleSelectModule(targetModule);
              }
            }} 
          />
        ) : view === 'settings' ? (
          <SettingsPanel
            settings={settings}
            onUpdate={updateSetting}
            onReset={resetSettings}
            onResetProgress={resetProgress}
            onBack={() => setView(previousView)}
            session={session}
            subscription={subscription}
            subscriptionError={subscriptionError}
            onManageBilling={openBillingPortal}
            onUpgrade={() => setShowPricing(true)}
          />
        ) : view === 'dashboard' ? (
          <Dashboard
            modules={modulesManifest}
            stats={stats}
            progress={progress}
            getModuleStatus={getModuleStatus}
            getModuleProgress={getModuleProgress}
            getNextSuggestedModule={getNextSuggestedModule}
            getRefreshModules={getRefreshModules}
            onSelectModule={handleSelectModule}
            onBrowseAll={() => setView('modules')}
            hasPremiumAccess={hasPremiumAccess}
            isModuleFree={isModuleFree}
            onUpgrade={() => setShowPricing(true)}
          />
        ) : view === 'modules' ? (
          <ModuleSelector
            modules={modulesManifest}
            onSelect={handleSelectModule}
            practiceMode={practiceMode}
            onPracticeModeChange={setPracticeMode}
            getModuleStatus={getModuleStatus}
            getModuleProgress={getModuleProgress}
            onBack={() => setView('dashboard')}
            hasPremiumAccess={hasPremiumAccess}
            isModuleFree={isModuleFree}
          />
        ) : isModuleLoading ? (
          <div className="lesson-finished glass-panel" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <h2 className="finished-title">Loading lesson...</h2>
            <p className="finished-subtitle">
              Preparing {modulesManifest[activeModuleIndex]?.title}.
            </p>
          </div>
        ) : moduleLoadError ? (
          <div className="lesson-finished glass-panel">
            <h2 className="finished-title">Lesson unavailable</h2>
            <p className="finished-subtitle">
              {moduleLoadError}
            </p>
            <div className="finished-actions">
              <button className="btn-secondary" onClick={handleBackFromLesson}>
                ← {lessonOriginView === 'modules' ? 'All Modules' : 'Dashboard'}
              </button>
              {activeModuleIndex !== null && (
                <button className="btn-primary" onClick={() => loadModuleAtIndex(activeModuleIndex)}>
                  Retry
                </button>
              )}
            </div>
          </div>
        ) : !activeModule ? (
          <div className="lesson-finished glass-panel">
            <h2 className="finished-title">Lesson unavailable</h2>
            <p className="finished-subtitle">
              No lesson data was loaded.
            </p>
            <div className="finished-actions">
              <button className="btn-secondary" onClick={handleBackFromLesson}>
                ← {lessonOriginView === 'modules' ? 'All Modules' : 'Dashboard'}
              </button>
            </div>
          </div>
        ) : (
          <LessonPlayer
            key={`${activeModule.id}-${practiceMode}`}
            module={activeModule}
            modules={modulesManifest}
            moduleIndex={activeModuleIndex}
            practiceMode={practiceMode}
            settings={settings}
            onBack={handleBackFromLesson}
            backLabel={lessonOriginView === 'modules' ? 'All Modules' : 'Dashboard'}
            onNextModule={handleNextModule}
            saveModuleProgress={saveModuleProgress}
            completeModule={completeModule}
            getSavedIndex={getSavedMergedIndex}
          />
        )}
      </main>

      <footer className="app-footer">
        <span>© {new Date().getFullYear()} LangLearn</span>
        <button type="button" onClick={() => setLegalDocument('terms')}>Terms</button>
        <button type="button" onClick={() => setLegalDocument('privacy')}>Privacy</button>
      </footer>

      {showSignOutConfirm && (
        <div className="modal-overlay" onClick={closeSignOutConfirm}>
          <div
            ref={dialogRef}
            className="modal-content glass-panel animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-dialog-title"
            aria-describedby="account-dialog-description"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="account-dialog-title">
              {session ? 'Sign out?' : 'Sign in to LangLearn?'}
            </h2>
            <p id="account-dialog-description">
              {session
                ? 'You can sign back in at any time.'
                : 'Your guest progress stays on this device. Sign in to access your account instead.'}
            </p>
            <div className="modal-actions">
              <button
                className="btn-primary"
                onClick={() => {
                  setShowSignOutConfirm(false);
                  if (session) {
                    handleLogout();
                  } else {
                    handleExitGuestMode();
                  }
                }}
              >
                {session ? 'Sign out' : 'Go to sign in'}
              </button>
              <button
                ref={dialogCancelButtonRef}
                className="btn-secondary"
                onClick={closeSignOutConfirm}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <PricingModal
        isOpen={showPricing}
        isSignedIn={Boolean(session)}
        onClose={() => setShowPricing(false)}
        onSignIn={() => {
          setShowPricing(false);
          handleExitGuestMode();
        }}
        onCheckout={startCheckout}
      />
      <LegalModal document={legalDocument} onClose={() => setLegalDocument(null)} />
    </div>
  );
}

export default App;
