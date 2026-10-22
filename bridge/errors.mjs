// Stable machine codes; diagnostics keep the original service message.
export function generationErrorCode(detail) {
  const message=String(detail);
  if (/cancelled|canceled/i.test(message)) return 'CANCELLED';
  if (/outdated|incompatible|runtime.contract/i.test(message)) return 'RUNTIME_INCOMPATIBLE';
  if (/save.slot identity|select a save slot/i.test(message)) return 'SAVE_SLOT_UNAVAILABLE';
  if (/run ended|run.*changed|another run|run mismatch/i.test(message)) return 'STALE_RUN';
  if (/timed out|timeout/i.test(message)) return 'TIMEOUT';
  if (/journal|persist|disk|ledger|manifest/i.test(message)) return 'PERSISTENCE_FAILED';
  if (/limit|capacity|full|reservation|already pending|another request/i.test(message)) return 'CAPACITY';
  if (/ComfyUI.*(not running|health check|unavailable)|image service.*unavailable/i.test(message)) return 'ART_SERVICE_UNAVAILABLE';
  if (/ComfyUI|artwork|image|checkpoint/i.test(message)) return 'ART_GENERATION_FAILED';
  if (/JSON|schema|truncat|validation|invalid|profile.*(object|belong|rejected)/i.test(message)) return 'INVALID_OUTPUT';
  if (/Token Factory|text request|socket|fetch|network|connect/i.test(message)) return 'TEXT_SERVICE_UNAVAILABLE';
  if (/journal|persist|save|disk/i.test(message)) return 'PERSISTENCE_FAILED';
  if (/publish|deliver|pipe|ACK/i.test(message)) return 'DELIVERY_FAILED';
  return 'GENERATION_FAILED';
}
