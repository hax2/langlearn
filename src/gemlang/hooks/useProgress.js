import { useState, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'gemlang-progress';

const EMPTY_PROGRESS = {
  modules: {},
  lastModuleId: null,
  lastPracticeMode: 'guided',
  hasChosenLevel: false,
};

const loadProgress = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.modules && Object.keys(parsed.modules).length > 0 && parsed.hasChosenLevel === undefined) {
         parsed.hasChosenLevel = true;
      }
      return { ...EMPTY_PROGRESS, ...parsed };
    }
  } catch {
    /* corrupted data – fall back to empty */
  }
  return { ...EMPTY_PROGRESS };
};

const persistProgress = (progress) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* storage full / blocked – silently ignore */
  }
};

export default function useProgress(modulesManifest) {
  const [progress, setProgress] = useState(loadProgress);

  const update = useCallback((fn) => {
    setProgress((prev) => {
      const next = fn(prev);
      persistProgress(next);
      return next;
    });
  }, []);

  /** Save position within a module as the user advances */
  const saveModuleProgress = useCallback((moduleId, currentIndex, practiceMode, totalSentences) => {
    update((prev) => ({
      ...prev,
      lastModuleId: moduleId,
      lastPracticeMode: practiceMode,
      modules: {
        ...prev.modules,
        [moduleId]: {
          ...(prev.modules[moduleId] || {}),
          currentIndex,
          totalSentences,
          practiceMode,
          lastAccessedAt: new Date().toISOString(),
        },
      },
    }));
  }, [update]);

  /** Mark a module as completed with a self-assessment confidence level */
  const completeModule = useCallback((moduleId, confidence, totalSentences) => {
    update((prev) => {
      const existing = prev.modules[moduleId] || {};
      return {
        ...prev,
        modules: {
          ...prev.modules,
          [moduleId]: {
            ...existing,
            currentIndex: totalSentences, // at the end
            totalSentences,
            completedAt: new Date().toISOString(),
            confidence, // "confident" | "somewhat" | "needsRefresh"
            lastAccessedAt: new Date().toISOString(),
            timesCompleted: (existing.timesCompleted || 0) + 1,
          },
        },
      };
    });
  }, [update]);

  /** Get the status of a specific module */
  const getModuleStatus = useCallback((moduleId) => {
    const mod = progress.modules[moduleId];
    if (!mod) return 'not-started';
    if (mod.completedAt) {
      if (mod.confidence === 'needsRefresh' || mod.confidence === 'somewhat') {
        return 'needs-refresh';
      }
      return 'completed';
    }
    if (mod.currentIndex > 0) return 'in-progress';
    return 'not-started';
  }, [progress]);

  /** Get progress details for a module */
  const getModuleProgress = useCallback((moduleId) => {
    const mod = progress.modules[moduleId];
    if (!mod) return { current: 0, total: 0, percentage: 0 };
    const total = mod.totalSentences || 0;
    const current = mod.completedAt ? total : Math.min(mod.currentIndex || 0, total);
    return {
      current,
      total,
      percentage: total > 0 ? Math.round((current / total) * 100) : 0,
    };
  }, [progress]);

  /** Get the next suggested module (first uncompleted in manifest order, or first needs-refresh) */
  const getNextSuggestedModule = useCallback(() => {
    if (!modulesManifest) return null;

    // First priority: find the module the user was last working on (in-progress)
    if (progress.lastModuleId) {
      const status = getModuleStatus(progress.lastModuleId);
      if (status === 'in-progress') {
        return modulesManifest.find((m) => m.id === progress.lastModuleId) || null;
      }
    }

    // Second priority: first not-started module (in manifest order)
    const notStarted = modulesManifest.find((m) => getModuleStatus(m.id) === 'not-started');
    if (notStarted) return notStarted;

    // Third priority: oldest needs-refresh module
    const refreshCandidates = modulesManifest
      .filter((m) => getModuleStatus(m.id) === 'needs-refresh')
      .sort((a, b) => {
        const aTime = progress.modules[a.id]?.completedAt || '';
        const bTime = progress.modules[b.id]?.completedAt || '';
        return aTime.localeCompare(bTime); // oldest first
      });
    if (refreshCandidates.length > 0) return refreshCandidates[0];

    return null;
  }, [modulesManifest, progress, getModuleStatus]);

  /** Get modules that need refreshing */
  const getRefreshModules = useCallback(() => {
    if (!modulesManifest) return [];
    return modulesManifest
      .filter((m) => getModuleStatus(m.id) === 'needs-refresh')
      .sort((a, b) => {
        const aTime = progress.modules[a.id]?.completedAt || '';
        const bTime = progress.modules[b.id]?.completedAt || '';
        return aTime.localeCompare(bTime);
      });
  }, [modulesManifest, progress, getModuleStatus]);

  /** Overall stats */
  const stats = useMemo(() => {
    if (!modulesManifest) return { completed: 0, inProgress: 0, total: 0, totalSentencesPracticed: 0 };
    let completed = 0;
    let inProgress = 0;
    let totalSentencesPracticed = 0;

    modulesManifest.forEach((m) => {
      const status = getModuleStatus(m.id);
      if (status === 'completed') completed++;
      else if (status === 'needs-refresh') completed++; // still counts as "completed once"
      else if (status === 'in-progress') inProgress++;

      const mod = progress.modules[m.id];
      if (mod) {
        totalSentencesPracticed += mod.completedAt
          ? (mod.totalSentences || 0)
          : (mod.currentIndex || 0);
      }
    });

    return {
      completed,
      inProgress,
      total: modulesManifest.length,
      totalSentencesPracticed,
    };
  }, [modulesManifest, progress, getModuleStatus]);

  /** Reset all progress */
  const resetProgress = useCallback(() => {
    const empty = { ...EMPTY_PROGRESS };
    setProgress(empty);
    persistProgress(empty);
    try {
      localStorage.removeItem('gemlang-tutorial-seen');
    } catch {
      // ignore
    }
  }, []);

  /** Set starting level for new users */
  const setStartingLevel = useCallback((levelType, specificModuleId = null) => {
    update((prev) => {
      const updatedModules = { ...prev.modules };
      let targetIndex = 0;
      
      if (levelType === 'granular' && specificModuleId) {
        targetIndex = modulesManifest.findIndex(m => m.id === specificModuleId);
      } else if (levelType === 'Intermediate') {
        targetIndex = modulesManifest.findIndex(m => m.level === 'Intermediate');
      } else if (levelType === 'Advanced') {
        targetIndex = modulesManifest.findIndex(m => m.level === 'Advanced');
      }
      
      if (targetIndex > 0) {
        for (let i = 0; i < targetIndex; i++) {
          const m = modulesManifest[i];
          if (!updatedModules[m.id]) {
            updatedModules[m.id] = {
              currentIndex: m.sentenceCount || 10,
              totalSentences: m.sentenceCount || 10,
              completedAt: new Date().toISOString(),
              confidence: 'confident',
              lastAccessedAt: new Date().toISOString(),
              timesCompleted: 1,
            };
          }
        }
      }

      return {
        ...prev,
        hasChosenLevel: true,
        modules: updatedModules,
      };
    });
  }, [update, modulesManifest]);

  return {
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
  };
}
