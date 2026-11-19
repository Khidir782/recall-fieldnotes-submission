const NAME = "recall-fieldnotes",
  STORE = "workspaces";
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(Error("Close another tab to enable device saving."));
  });
}
async function transaction(mode, action) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let value;
      const req = action(tx.objectStore(STORE));
      req.onsuccess = () => {
        value = req.result;
      };
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || Error("Device saving was interrupted."));
    });
  } finally {
    db.close();
  }
}
export const readWorkspace = (key) =>
  transaction("readonly", (store) => store.get(key));
export const writeWorkspace = (key, value) =>
  transaction("readwrite", (store) => store.put(value, key));
export const removeWorkspace = (key) =>
  transaction("readwrite", (store) => store.delete(key));
export function newWorkspace() {
  return {
    id: crypto.randomUUID(),
    revision: 0,
    syncedCount: 0,
    roundIds: [],
    data: null,
    attached: false,
    researchPermission: false,
  };
}
