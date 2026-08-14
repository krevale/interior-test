import { useState } from 'react';

/**
 * Copy-to-clipboard with a visible fallback. Clipboard access is refused in
 * embedded and insecure contexts, so the prompt must always be reachable by
 * hand; the toggle is also useful on its own while tuning the wording.
 */
export function PromptBlock({ prompt, rows = 10 }: { prompt: string; rows?: number }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setRevealed(true);
    }
  };

  return (
    <>
      <div className="row">
        <button onClick={copy}>{copied ? 'Copied' : 'Copy prompt'}</button>
        <button onClick={() => setRevealed((v) => !v)}>
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
      {revealed && <textarea className="prompt" readOnly value={prompt} rows={rows} />}
    </>
  );
}
