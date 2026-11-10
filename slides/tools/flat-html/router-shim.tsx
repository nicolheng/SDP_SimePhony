// Used only by build-flat.mjs. Swaps react-router's BrowserRouter for a MemoryRouter,
// because a file opened from disk (file://C:/...) has no "/s/<deck>" path to route on.
import type { ReactNode } from 'react';
// The real package, imported by absolute path so the alias below doesn't loop back here.
import { MemoryRouter } from 'REAL_REACT_ROUTER_DOM';

export * from 'REAL_REACT_ROUTER_DOM';

const START = (globalThis as { __FLAT_START__?: string }).__FLAT_START__ ?? '/';

export function BrowserRouter({ children }: { basename?: string; children?: ReactNode }) {
  return <MemoryRouter initialEntries={[START]}>{children}</MemoryRouter>;
}
