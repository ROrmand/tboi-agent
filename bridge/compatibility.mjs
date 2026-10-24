// Report the contract loaded by Isaac, not the files currently on disk.
// Updating a mod while the game is open does not reload its Lua runtime.
export const RUNTIME_CONTRACT = 13;

export function assertRuntimeCompatible(context) {
  if (context?.runtime_contract !== RUNTIME_CONTRACT) {
    throw Error('Isaac is running an outdated or incompatible Live Sprite Swap Demo. Install the updated mod, run npm run art:prepare, then fully restart Isaac and the bridge.');
  }
  if (![1,2,3].includes(context.save_slot)) throw Error('Save-slot identity unavailable. Select a save slot and fully restart Isaac.');
}
