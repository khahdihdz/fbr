export function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IDB request thất bại'));
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IDB transaction thất bại'));
    tx.onabort = () => reject(tx.error ?? new Error('IDB transaction bị huỷ'));
  });
}

export function openDatabase(
  name: string,
  version: number,
  onUpgrade: (db: IDBDatabase, oldVersion: number, transaction: IDBTransaction) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    let upgradeTx: IDBTransaction | null = null;
    request.onupgradeneeded = (event) => {
      upgradeTx = request.transaction;
      onUpgrade(request.result, event.oldVersion, request.transaction as IDBTransaction);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      void upgradeTx;
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Không mở được IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB bị chặn bởi tab khác'));
  });
}
