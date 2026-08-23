const TUTORIAL_SEEN_KEY = 'gemlang-tutorial-seen';

export const hasSeenTutorial = () => {
  try {
    return localStorage.getItem(TUTORIAL_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
};

export const markTutorialSeen = () => {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, 'true');
  } catch {
    // localStorage unavailable
  }
};
