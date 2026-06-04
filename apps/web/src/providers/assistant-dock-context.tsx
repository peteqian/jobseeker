import type { CoachAnchorType } from "@jobseeker/contracts";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface AnchorRequest {
  anchorType: CoachAnchorType;
  anchorId: string;
  title?: string;
}

interface AssistantDockContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  /** Anchor types the current page produces — used by the dock's "This page" filter. */
  pageAnchorTypes: readonly string[];
  setPageAnchorTypes: (types: readonly string[]) => void;
  /** Pending anchored-open request; the dock consumes it to find-or-create a thread. */
  anchorRequest: AnchorRequest | null;
  requestAnchored: (req: AnchorRequest) => void;
  clearAnchorRequest: () => void;
}

const AssistantDockContext = createContext<AssistantDockContextValue | null>(null);

export function AssistantDockProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pageAnchorTypes, setPageAnchorTypes] = useState<readonly string[]>([]);
  const [anchorRequest, setAnchorRequest] = useState<AnchorRequest | null>(null);

  const requestAnchored = useCallback((req: AnchorRequest) => {
    setAnchorRequest(req);
    setIsOpen(true);
  }, []);

  const value = useMemo<AssistantDockContextValue>(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((v) => !v),
      activeThreadId,
      setActiveThreadId,
      pageAnchorTypes,
      setPageAnchorTypes,
      anchorRequest,
      requestAnchored,
      clearAnchorRequest: () => setAnchorRequest(null),
    }),
    [isOpen, activeThreadId, pageAnchorTypes, anchorRequest, requestAnchored],
  );

  return <AssistantDockContext.Provider value={value}>{children}</AssistantDockContext.Provider>;
}

export function useAssistantDock() {
  const ctx = useContext(AssistantDockContext);
  if (!ctx) {
    throw new Error("useAssistantDock must be used within AssistantDockProvider");
  }
  return ctx;
}

/** Register the anchor types the current page produces (for the "This page" filter). */
export function useAssistantPageAnchors(types: readonly string[]) {
  const ctx = useContext(AssistantDockContext);
  const setPageAnchorTypes = ctx?.setPageAnchorTypes;
  // Stable key so the effect only re-runs when the set of types changes.
  const key = types.join(",");

  useEffect(() => {
    if (!setPageAnchorTypes) return undefined;
    setPageAnchorTypes(key ? key.split(",") : []);
    return () => setPageAnchorTypes([]);
  }, [key, setPageAnchorTypes]);
}
