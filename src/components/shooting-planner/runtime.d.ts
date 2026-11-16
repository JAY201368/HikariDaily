import type { Notebook, Reference } from '@/domain/planner';
import type { PlannerStorage } from './storage';
export type PlannerRuntimeStorage = Pick<PlannerStorage, 'save' | 'flush' | 'draft' | 'view' | 'addImage' | 'retryImage'>;
export type PlannerRuntime = {
  prepareNavigation(): Promise<void>;
  showIndex(): void;
  refresh(): void;
  replace(notebook: Notebook): void;
  setReference(reference: Reference | null): void;
  receiveReference(reference: Reference): void;
  destroy(): void;
};
export function mountPlanner(root: ShadowRoot, options: {
  notebook: Notebook; storage: PlannerRuntimeStorage; draft: unknown; view: unknown;
  onClose(): void; onStatus?(message: string, error?: boolean): void;
  reducedMotion?(): boolean;
}): PlannerRuntime;
