import { useEffect, useRef } from 'react';

/**
 * Hosts one of the standalone static sub-apps (Reader at /read/, Puente at
 * /practice/) inside the shell. The sub-apps are complete documents copied
 * verbatim from their original projects, so an iframe keeps them fully
 * functional while the unified navigation stays around them.
 */
export default function SubAppFrame({ src, title, description }) {
  const frameRef = useRef(null);

  useEffect(() => {
    document.title = `${title} · LangLearn`;
    return () => {
      document.title = 'LangLearn · Learn Spanish';
    };
  }, [title]);

  return (
    <div className="subapp-frame">
      <iframe
        ref={frameRef}
        src={src}
        title={`${title} — ${description}`}
        className="subapp-iframe"
        allow="microphone; autoplay; encrypted-media; fullscreen"
      />
    </div>
  );
}
