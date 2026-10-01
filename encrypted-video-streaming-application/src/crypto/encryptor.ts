import { HEADER_FAKE_SIZE, HEADER_LEN_SIZE, SALTS_SIZE, HEADER_TOTAL_SIZE } from './constants';

function safeGetRandomValues(array: Uint8Array): Uint8Array {
  try {
    return crypto.getRandomValues(array);
  } catch (e) {
    for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 256);
    return array;
  }
}

export async function performEncryption(
  sourceFile: File, 
  masterKey: Uint8Array, 
  salts: Uint8Array,
  onProgress: (p: number) => void
): Promise<Blob> {
  const CHUNK_SIZE = 1024 * 512;
  const totalChunks = Math.ceil(sourceFile.size / CHUNK_SIZE);
  
  const k4Hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...masterKey, 3])));
  const paramsBuffer = new ArrayBuffer(104);
  const view = new DataView(paramsBuffer);
  view.setUint32(0, CHUNK_SIZE, true);
  view.setUint32(4, totalChunks, true);
  view.setUint8(8, sourceFile.type.length);
  new Uint8Array(paramsBuffer, 9, sourceFile.type.length).set(new TextEncoder().encode(sourceFile.type));
  view.setBigUint64(41, BigInt(sourceFile.size), true);
  
  const iv = safeGetRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', k4Hash as any, 'AES-GCM', false, ['encrypt']);
  const encParamsBody = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as any }, key, paramsBuffer as any));
  const finalEncParams = new Uint8Array(116);
  finalEncParams.set(iv); finalEncParams.set(encParamsBody, 12);

  const header = new Uint8Array(HEADER_TOTAL_SIZE);
  header.set(safeGetRandomValues(new Uint8Array(HEADER_FAKE_SIZE)));
  new DataView(header.buffer).setUint32(HEADER_FAKE_SIZE, HEADER_TOTAL_SIZE, true);
  header.set(salts, HEADER_FAKE_SIZE + HEADER_LEN_SIZE);
  header.set(finalEncParams, HEADER_FAKE_SIZE + HEADER_LEN_SIZE + SALTS_SIZE);

  const encryptedBlobParts: BlobPart[] = new Array(totalChunks + 1);
  encryptedBlobParts[0] = header;

  const cores = Math.max(1, navigator.hardwareConcurrency || 2);
  const numWorkers = Math.min(cores, 4);
  const workers = Array.from({ length: numWorkers }, () => new Worker(new URL('../workers/decrypt.worker.ts', import.meta.url), { type: 'module' }));
  
  let active = 0;
  let currentChunk = 0;

  return new Promise((resolve) => {
    const processNext = async () => {
      if (currentChunk >= totalChunks) {
        if (active === 0) {
          workers.forEach(w => w.terminate());
          resolve(new Blob(encryptedBlobParts, { type: 'application/octet-stream' }));
        }
        return;
      }

      const chunkIdx = currentChunk++;
      active++;
      
      const start = chunkIdx * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, sourceFile.size);
      const chunkData = await sourceFile.slice(start, end).arrayBuffer();
      const workerIdx = chunkIdx % workers.length;

      const handler = (e: MessageEvent) => {
        if (e.data.chunkIndex === chunkIdx) {
          workers[workerIdx].removeEventListener('message', handler);
          encryptedBlobParts[chunkIdx + 1] = e.data.processed;
          active--;
          if (chunkIdx % 5 === 0) onProgress(Math.round((chunkIdx / totalChunks) * 100));
          processNext();
        }
      };

      workers[workerIdx].addEventListener('message', handler);
      workers[workerIdx].postMessage({ chunk: chunkData, masterKey, chunkIndex: chunkIdx, mode: 'ENCRYPT' }, [chunkData]);

      if (active < numWorkers && currentChunk < totalChunks) processNext();
    };

    // Fill the pipeline
    for (let i = 0; i < numWorkers; i++) processNext();
  });
}
