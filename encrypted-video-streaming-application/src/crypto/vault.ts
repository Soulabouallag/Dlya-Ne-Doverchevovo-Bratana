export interface VaultHeader {
  chunkSize: number;
  totalChunks: number;
  mimeType: string;
  originalSize: bigint;
}

export async function deriveMasterKey(password: string, salts: Uint8Array, onProgress: (p: number) => void): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/kdf.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.type === 'progress') onProgress(e.data.value);
      if (e.data.type === 'done') {
        worker.terminate();
        resolve(e.data.key);
      }
      if (e.data.type === 'error') {
        worker.terminate();
        reject(new Error(e.data.error));
      }
    };
    worker.postMessage({ password, salts });
  });
}

export async function decryptParams(masterKey: Uint8Array, encryptedParams: Uint8Array): Promise<VaultHeader> {
  const k4Hash = await crypto.subtle.digest('SHA-256', new Uint8Array([...masterKey, 3]));
  const key = await crypto.subtle.importKey('raw', k4Hash, 'AES-GCM', false, ['decrypt']);
  const iv = encryptedParams.slice(0, 12);
  const data = encryptedParams.slice(12, 116);
  
  try {
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as any }, key, data as any);
    const view = new DataView(decrypted);
    const chunkSize = view.getUint32(0, true);
    const totalChunks = view.getUint32(4, true);
    const mimeLen = view.getUint8(8);
    const mimeType = new TextDecoder().decode(new Uint8Array(decrypted, 9, mimeLen));
    const originalSize = view.getBigUint64(41, true);
    
    return { chunkSize, totalChunks, mimeType, originalSize };
  } catch (e) {
    throw new Error("Matrix auth failed. Check passkey.");
  }
}
