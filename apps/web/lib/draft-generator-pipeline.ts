// Slice 7a.4: la pipeline e' stata spostata in @premura/agents per
// condivisione fra apps/web e apps/api (worker BullMQ draft-generation).
// Questo file resta come thin re-export per non rompere i call-site
// esistenti (apps/web/lib/repositories/messages.ts fire-and-forget +
// tests).
export {
  type DraftGenerationResult,
  type TriggerDraftGenerationInput,
  decideRouting,
  triggerDraftGeneration,
} from '@premura/agents';
