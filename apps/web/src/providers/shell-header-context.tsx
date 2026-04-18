import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";

export interface ShellHeaderMeta {
  title: string;
  description?: string;
  action?: ReactNode;
}

interface ShellHeaderContextValue {
  meta: ShellHeaderMeta | null;
  setMeta: (meta: ShellHeaderMeta | null) => void;
}

const ShellHeaderContext = createContext<ShellHeaderContextValue | null>(null);

export function ShellHeaderProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<ShellHeaderMeta | null>(null);
  const value = useMemo(() => ({ meta, setMeta }), [meta]);

  return <ShellHeaderContext.Provider value={value}>{children}</ShellHeaderContext.Provider>;
}

export function useShellHeader(meta: ShellHeaderMeta) {
  const context = useContext(ShellHeaderContext);

  useEffect(() => {
    if (!context) {
      return undefined;
    }

    context.setMeta(meta);
    return () => context.setMeta(null);
  }, [context, meta]);
}

export function useShellHeaderContext() {
  const context = useContext(ShellHeaderContext);
  if (!context) {
    throw new Error("useShellHeaderContext must be used within ShellHeaderProvider");
  }

  return context;
}
