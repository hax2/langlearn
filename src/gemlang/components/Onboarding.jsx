import React, { useState } from 'react';
import './Onboarding.css';

const LEVEL_OPTIONS = [
  { name: 'Beginner', description: 'Start with core phrases and foundations' },
  { name: 'Intermediate', description: 'Build fluency with richer grammar' },
  { name: 'Advanced', description: 'Practice nuance and complex structures' },
];

const Onboarding = ({ modules, onComplete }) => {
  const [selectedLevel, setSelectedLevel] = useState('Beginner');
  const [showModuleList, setShowModuleList] = useState(false);
  const [selectedModule, setSelectedModule] = useState(modules[0]?.id);

  const handleStart = () => {
    if (showModuleList) {
      onComplete('granular', selectedModule);
    } else {
      onComplete(selectedLevel);
    }
  };

  return (
    <div className="onboarding-container animate-fade-in">
      <div className="onboarding-content glass-panel">
        <div className="onboarding-intro">
          <h1 className="onboarding-title">Choose your level</h1>
          <p>We’ll start you in the right place. You can browse every module later.</p>
        </div>

        {!showModuleList ? (
          <div className="onboarding-selection">
            <div className="level-options">
              {LEVEL_OPTIONS.map((level) => (
                <button
                  type="button"
                  key={level.name}
                  className={`level-btn ${selectedLevel === level.name ? 'active' : ''}`}
                  onClick={() => setSelectedLevel(level.name)}
                  aria-pressed={selectedLevel === level.name}
                >
                  <span className="level-btn-copy">
                    <strong>{level.name}</strong>
                    <small>{level.description}</small>
                  </span>
                  <span className="level-check" aria-hidden="true">✓</span>
                </button>
              ))}
              <div className="divider"><span>OR</span></div>
              <button
                type="button"
                className="level-btn choose-module-btn"
                onClick={() => setShowModuleList(true)}
              >
                <span className="level-btn-copy">
                  <strong>Choose a specific module</strong>
                  <small>Jump directly to a topic you already know you need</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <button className="btn-primary start-journey-btn" onClick={handleStart}>
              Start Learning
            </button>
          </div>
        ) : (
          <div className="onboarding-selection">
            <button type="button" className="btn-back" onClick={() => setShowModuleList(false)}>← Back</button>
            <div className="module-selection">
              <h2>Select starting point</h2>
              <div className="module-list">
                {modules.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    className={`module-list-btn ${selectedModule === m.id ? 'active' : ''}`}
                    onClick={() => setSelectedModule(m.id)}
                    aria-pressed={selectedModule === m.id}
                  >
                    <span>{m.title}</span>
                    <small>{m.level} · {m.sentenceCount} sentences</small>
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="btn-primary start-journey-btn" onClick={handleStart}>
              Start Learning
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
