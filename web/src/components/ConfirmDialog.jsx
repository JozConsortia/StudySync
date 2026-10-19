import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

// A styled replacement for window.confirm(): matches the app's theme instead of the browser's
// "localhost says" box. Use: const confirm = useConfirm(); if (await confirm({ ... })) { ... }

const ConfirmContext = createContext(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null); // { title, message, confirmLabel, cancelLabel, danger, resolve }

  const confirm = useCallback(
    (options) => new Promise((resolve) => setRequest({ confirmLabel: "OK", cancelLabel: "Cancel", ...options, resolve })),
    []
  );

  const close = (result) => {
    request?.resolve(result);
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && <Dialog request={request} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function Dialog({ request, onClose }) {
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus(); // the safe choice is focused, so Enter never deletes by accident
    const onKey = (e) => e.key === "Escape" && onClose(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose(false)}>
      <div className="dialog card" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-message">
        <div className={request.danger ? "dialog-icon danger" : "dialog-icon"}>
          <AlertTriangle size={20} />
        </div>
        <div className="dialog-body">
          <h2 id="dialog-title">{request.title}</h2>
          {request.message && (
            <p id="dialog-message" className="muted">
              {request.message}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <button ref={cancelRef} className="btn" onClick={() => onClose(false)}>
            {request.cancelLabel}
          </button>
          <button className={request.danger ? "btn btn-danger" : "btn btn-primary"} onClick={() => onClose(true)}>
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
