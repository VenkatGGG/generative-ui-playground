import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { ActionBindingV2, UISpecV2 } from "@repo/contracts";
import {
  getValueAtStatePath,
  resolveDynamicValueV2,
  type RepeatScopeV2
} from "@repo/spec-engine";
import type { RendererWarningV2 } from "./types-v2";

function pathSegments(path: string): string[] | null {
  if (path === "/") {
    return [];
  }
  if (!path.startsWith("/")) {
    return null;
  }
  return path
    .slice(1)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function clonePathForWrite(root: Record<string, unknown>, path: string): Record<string, unknown> {
  const segments = pathSegments(path);
  if (!segments) {
    return root;
  }

  const nextRoot = structuredClone(root);
  let cursor: unknown = nextRoot;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i]!;
    if (Array.isArray(cursor)) {
      const index = Number.parseInt(key, 10);
      const current = cursor[index];
      if (current === null || typeof current !== "object") {
        cursor[index] = {};
      }
      cursor = cursor[index] as unknown;
      continue;
    }

    if (cursor && typeof cursor === "object") {
      const record = cursor as Record<string, unknown>;
      if (record[key] === null || typeof record[key] !== "object") {
        record[key] = {};
      }
      cursor = record[key];
    }
  }

  return nextRoot;
}

function setValueAtPath(root: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const segments = pathSegments(path);
  if (!segments || segments.length === 0) {
    return root;
  }
  const nextRoot = clonePathForWrite(root, path);
  let cursor: unknown = nextRoot;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i]!;
    if (Array.isArray(cursor)) {
      cursor = cursor[Number.parseInt(key, 10)];
    } else if (cursor && typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[key];
    }
  }

  const last = segments[segments.length - 1]!;
  if (Array.isArray(cursor)) {
    const index = Number.parseInt(last, 10);
    cursor[index] = value;
  } else if (cursor && typeof cursor === "object") {
    (cursor as Record<string, unknown>)[last] = value;
  }

  return nextRoot;
}

function removeValueAtPath(root: Record<string, unknown>, path: string): Record<string, unknown> {
  const segments = pathSegments(path);
  if (!segments || segments.length === 0) {
    return root;
  }

  const nextRoot = clonePathForWrite(root, path);
  let cursor: unknown = nextRoot;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i]!;
    if (Array.isArray(cursor)) {
      cursor = cursor[Number.parseInt(key, 10)];
    } else if (cursor && typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[key];
    }
  }

  const last = segments[segments.length - 1]!;
  if (Array.isArray(cursor)) {
    const index = Number.parseInt(last, 10);
    if (Number.isFinite(index) && index >= 0 && index < cursor.length) {
      cursor.splice(index, 1);
    }
  } else if (cursor && typeof cursor === "object") {
    delete (cursor as Record<string, unknown>)[last];
  }

  return nextRoot;
}

function extractActionList(binding: ActionBindingV2 | ActionBindingV2[] | undefined): ActionBindingV2[] {
  if (!binding) {
    return [];
  }
  return Array.isArray(binding) ? binding : [binding];
}

function resolveActionParams(
  params: Record<string, unknown> | undefined,
  state: Record<string, unknown>,
  scope: RepeatScopeV2 | undefined
): Record<string, unknown> {
  if (!params) {
    return {};
  }
  const resolved = resolveDynamicValueV2(params, { state, scope });
  return (resolved ?? {}) as Record<string, unknown>;
}

function resolveActionPath(params: Record<string, unknown>): string | null {
  const raw = typeof params.path === "string" ? params.path : params.statePath;
  return typeof raw === "string" ? raw : null;
}

function toStringSafe(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export interface RuntimeV2ContextValue {
  state: Record<string, unknown>;
  warn: (warning: RendererWarningV2) => void;
  executeAction: (action: ActionBindingV2, scope: RepeatScopeV2 | undefined) => void;
}

const RuntimeV2Context = createContext<RuntimeV2ContextValue | null>(null);

export interface RuntimeProviderV2Props {
  spec: UISpecV2 | null;
  onWarning?: (warning: RendererWarningV2) => void;
  children: ReactNode;
}

export function RuntimeProviderV2({ spec, onWarning, children }: RuntimeProviderV2Props) {
  const [state, setState] = useState<Record<string, unknown>>(() => (spec?.state ?? {}) as Record<string, unknown>);
  const previousStateRef = useRef<Record<string, unknown>>(state);
  const suppressWatchRef = useRef<boolean>(false);

  useEffect(() => {
    setState((spec?.state ?? {}) as Record<string, unknown>);
  }, [spec]);

  const warn = useCallback(
    (warning: RendererWarningV2): void => {
      onWarning?.(warning);
    },
    [onWarning]
  );

  const executeAction = useCallback(
    (action: ActionBindingV2, scope: RepeatScopeV2 | undefined): void => {
      setState((current) => {
        const params = resolveActionParams(action.params, current, scope);

        if (action.action === "setState") {
          const path = resolveActionPath(params);
          if (typeof path !== "string" || !path.startsWith("/")) {
            warn({
              code: "V2_ACTION_INVALID_SET_STATE",
              message: "setState action requires a valid JSON-pointer path."
            });
            return current;
          }
          suppressWatchRef.current = true;
          return setValueAtPath(current, path, params.value);
        }

        if (action.action === "pushState") {
          const path = resolveActionPath(params);
          if (typeof path !== "string" || !path.startsWith("/")) {
            warn({
              code: "V2_ACTION_INVALID_PUSH_STATE",
              message: "pushState action requires a valid JSON-pointer path."
            });
            return current;
          }
          const existing = getValueAtStatePath(current, path);
          const nextArray = Array.isArray(existing) ? [...existing, params.value] : [params.value];
          suppressWatchRef.current = true;
          return setValueAtPath(current, path, nextArray);
        }

        if (action.action === "removeState") {
          const path = resolveActionPath(params);
          if (typeof path !== "string" || !path.startsWith("/")) {
            warn({
              code: "V2_ACTION_INVALID_REMOVE_STATE",
              message: "removeState action requires a valid JSON-pointer path."
            });
            return current;
          }
          suppressWatchRef.current = true;
          return removeValueAtPath(current, path);
        }

        if (action.action === "validateForm") {
          const path = resolveActionPath(params);
          if (typeof path !== "string" || !path.startsWith("/")) {
            warn({
              code: "V2_ACTION_INVALID_VALIDATE_FORM",
              message: "validateForm action requires a valid JSON-pointer path."
            });
            return current;
          }

          const formValue = getValueAtStatePath(current, path);
          const required = Array.isArray(params.required) ? params.required.filter((v) => typeof v === "string") : [];
          let valid = true;
          if (formValue && typeof formValue === "object" && !Array.isArray(formValue)) {
            const form = formValue as Record<string, unknown>;
            for (const field of required) {
              if (!toStringSafe(form[field]).trim()) {
                valid = false;
                break;
              }
            }
          }
          suppressWatchRef.current = true;
          return setValueAtPath(current, `${path}/_valid`, valid);
        }

        return current;
      });
    },
    [warn]
  );

  const executeActions = useCallback(
    (actions: ActionBindingV2[], scope: RepeatScopeV2 | undefined): void => {
      for (const action of actions) {
        executeAction(action, scope);
      }
    },
    [executeAction]
  );

  const watchBindings = useMemo(() => {
    if (!spec) {
      return [] as Array<{ path: string; actions: ActionBindingV2[] }>;
    }
    const entries: Array<{ path: string; actions: ActionBindingV2[] }> = [];
    for (const element of Object.values(spec.elements)) {
      if (!element.watch) {
        continue;
      }
      for (const [path, binding] of Object.entries(element.watch)) {
        entries.push({
          path,
          actions: extractActionList(binding)
        });
      }
    }
    return entries;
  }, [spec]);

  useEffect(() => {
    if (!spec) {
      return;
    }

    if (suppressWatchRef.current) {
      suppressWatchRef.current = false;
      previousStateRef.current = state;
      return;
    }

    const previousState = previousStateRef.current;
    for (const watchEntry of watchBindings) {
      const previousValue = getValueAtStatePath(previousState, watchEntry.path);
      const currentValue = getValueAtStatePath(state, watchEntry.path);
      if (Object.is(previousValue, currentValue)) {
        continue;
      }
      executeActions(watchEntry.actions, undefined);
    }

    previousStateRef.current = state;
  }, [executeActions, spec, state, watchBindings]);

  const value = useMemo<RuntimeV2ContextValue>(
    () => ({
      state,
      warn,
      executeAction
    }),
    [state, warn, executeAction]
  );

  return <RuntimeV2Context.Provider value={value}>{children}</RuntimeV2Context.Provider>;
}

export function useRuntimeV2(): RuntimeV2ContextValue {
  const context = useContext(RuntimeV2Context);
  if (!context) {
    throw new Error("useRuntimeV2 must be used within RuntimeProviderV2.");
  }
  return context;
}
