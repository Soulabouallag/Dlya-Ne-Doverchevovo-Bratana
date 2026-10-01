import { HEADER_TOTAL_SIZE, CHUNK_OVERHEAD } from './constants';

export class StreamDecryptor {
  private masterKey: Uint8Array;
  public chunkSize: number;
  public totalChunks: number;
  private encryptedBlob: Blob;
  private cache: Map<number, { data: Uint8Array; lastUsed: number }> = new Map();
  private maxCacheSize = 256 * 1024 * 1024;
  private _currentCacheSize = 0;
  private workerPool: Worker[] = [];
  private nextWorker = 0;
  private pendingRequests: Map<number, Promise<Uint8Array>> = new Map();
  public activeTasks = 0;
  private maxConcurrentTasks: number;
  public mimeType: string = 'video/mp4';
  public originalSize: bigint = 0n;

  get currentCacheSize() { return this._currentCacheSize; }

  constructor(masterKey: Uint8Array, chunkSize: number, totalChunks: number, encryptedBlob: Blob) {
    this.masterKey = masterKey;
    this.chunkSize = chunkSize;
    this.totalChunks = totalChunks;
    this.encryptedBlob = encryptedBlob;

    const cores = Math.max(1, navigator.hardwareConcurrency || 2);
    const numWorkers = Math.min(cores, 8); 
    // Ensure maxConcurrentTasks is at least 2 even on single-core devices
    this.maxConcurrentTasks = Math.max(2, numWorkers);

    for (let i = 0; i < numWorkers; i++) {
      this.createWorker(i);
    }
  }

  private createWorker(index: number, retryCount = 0) {
    if (retryCount > 3) {
      console.error(`Worker ${index} failed critically after 3 retries. Switching to fallback.`);
      return;
    }
    const worker = new Worker(new URL('../workers/decrypt.worker.ts', import.meta.url), { type: 'module' });
    worker.onerror = (e) => {
      console.error(`Worker ${index} error:`, e);
      worker.terminate();
      setTimeout(() => this.createWorker(index, retryCount + 1), 1000);
    };
    this.workerPool[index] = worker;
  }

  async getChunk(chunkIndex: number): Promise<Uint8Array> {
    if (chunkIndex < 0 || chunkIndex >= this.totalChunks) {
      throw new Error(`Chunk out of bounds: ${chunkIndex}`);
    }

    const cached = this.cache.get(chunkIndex);
    if (cached) {
      cached.lastUsed = Date.now();
      return cached.data;
    }

    if (this.pendingRequests.has(chunkIndex)) {
      return this.pendingRequests.get(chunkIndex)!;
    }

    const promise = this.queueDecrypt(chunkIndex);
    this.pendingRequests.set(chunkIndex, promise);
    const decrypted = await promise;
    this.pendingRequests.delete(chunkIndex);

    this.addToCache(chunkIndex, decrypted);
    return decrypted;
  }

  private async queueDecrypt(chunkIndex: number): Promise<Uint8Array> {
    while (this.activeTasks >= this.maxConcurrentTasks) {
      await new Promise(r => setTimeout(r, 10));
    }
    this.activeTasks++;
    try {
      return await this.decryptChunk(chunkIndex);
    } finally {
      this.activeTasks--;
    }
  }

  private async decryptChunk(chunkIndex: number): Promise<Uint8Array> {
    const encryptedChunkSize = this.chunkSize + CHUNK_OVERHEAD;
    const chunkStart = HEADER_TOTAL_SIZE + chunkIndex * encryptedChunkSize;
    const chunkEnd = chunkStart + encryptedChunkSize;

    // Safety check against blob boundaries
    if (chunkStart >= this.encryptedBlob.size) throw new Error("Offset exceeds blob size");

    const blobSlice = this.encryptedBlob.slice(chunkStart, Math.min(chunkEnd, this.encryptedBlob.size));
    const chunkData = new Uint8Array(await blobSlice.arrayBuffer());

    const worker = this.workerPool[this.nextWorker];
    this.nextWorker = (this.nextWorker + 1) % this.workerPool.length;

    return new Promise((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        if (e.data.chunkIndex === chunkIndex) {
          worker.removeEventListener('message', handler);
          if (e.data.type === 'done') resolve(new Uint8Array(e.data.processed));
          else reject(new Error(e.data.error));
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ chunk: chunkData, masterKey: this.masterKey, chunkIndex, mode: 'DECRYPT' }, [chunkData.buffer]);
    });
  }

  private addToCache(index: number, data: Uint8Array) {
    if (this._currentCacheSize + data.length > this.maxCacheSize) {
      const entries = Array.from(this.cache.entries()).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      for (const [key, val] of entries) {
        this.cache.delete(key);
        this._currentCacheSize -= val.data.length;
        if (this._currentCacheSize + data.length <= this.maxCacheSize) break;
      }
    }
    this.cache.set(index, { data, lastUsed: Date.now() });
    this._currentCacheSize += data.length;
  }

  destroy() {
    this.workerPool.forEach(w => w.terminate());
    this.cache.clear();
    this.pendingRequests.clear();
  }
}
