import {
  type Dispatch,
  type HTMLAttributes,
  type ReactNode,
  type SetStateAction,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface ShellHeaderMeta {
  title: string;
  description?: string;
}

interface ShellHeaderContextValue {
  meta: ShellHeaderMeta | null;
  actionsHost: HTMLDivElement | null;
  setMeta: Dispatch<SetStateAction<ShellHeaderMeta | null>>;
  setActionsHost: Dispatch<SetStateAction<HTMLDivElement | null>>;
}

const ShellHeaderContext = createContext<ShellHeaderContextValue | null>(null);

export function ShellHeaderProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<ShellHeaderMeta | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  const value = useMemo(
    () => ({ meta, actionsHost, setMeta, setActionsHost }),
    [actionsHost, meta],
  );

  return <ShellHeaderContext.Provider value={value}>{children}</ShellHeaderContext.Provider>;
}

export function useShellHeaderMeta(meta: ShellHeaderMeta) {
  const context = useContext(ShellHeaderContext);
  const { title, description } = meta;
  const setMeta = context?.setMeta;

  useEffect(() => {
    if (!setMeta) {
      return undefined;
    }

    setMeta((current) => {
      if (current?.title === title && current?.description === description) {
        return current;
      }

      return { title, description };
    });
  }, [description, setMeta, title]);

  useEffect(() => {
    if (!setMeta) {
      return undefined;
    }

    return () => setMeta(null);
  }, [setMeta]);
}

export function ShellHeaderActionsHost(props: HTMLAttributes<HTMLDivElement>) {
  const context = useContext(ShellHeaderContext);
  if (!context) {
    return <div {...props} />;
  }

  return <div ref={context.setActionsHost} {...props} />;
}

export function useShellHeaderActions(actions: ReactNode | null) {
  const context = useContext(ShellHeaderContext);
  return context?.actionsHost && actions ? createPortal(actions, context.actionsHost) : null;
}

export function useShellHeader(meta: ShellHeaderMeta) {
  useShellHeaderMeta(meta);
}

export function useShellHeaderContext() {
  const context = useContext(ShellHeaderContext);
  if (!context) {
    throw new Error("useShellHeaderContext must be used within ShellHeaderProvider");
  }

  return context;
}
