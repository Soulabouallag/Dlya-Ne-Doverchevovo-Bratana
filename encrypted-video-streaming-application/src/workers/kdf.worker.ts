import { argon2id, pbkdf2 } from 'hash-wasm';

self.onmessage = async (e: MessageEvent) => {
  const { password, salts } = e.data;
  
  try {
    const argon2Key = await (argon2id as any)({
      password: password,
      salt: salts.slice(0, 32),
      parallelism: 2,
      iterations: 4,
      memorySize: 65536,
      hashLength: 64,
      outputType: 'binary',
    });

    let currentKey = argon2Key;
    const iterations = 600000; 
    for (let i = 0; i < 6; i++) {
      const salt = salts.slice((i + 1) * 32, (i + 2) * 32);
      currentKey = await (pbkdf2 as any)({
        password: currentKey,
        salt: salt,
        iterations: iterations, 
        hashLength: 64,
        hashFunction: 'sha512',
        outputType: 'binary',
      });
      (self as any).postMessage({ type: 'progress', value: Math.round(((i + 1) / 6) * 100) });
    }

    (self as any).postMessage({ type: 'done', key: currentKey });
  } catch (err: any) {
    (self as any).postMessage({ type: 'error', error: err.message });
  }
};
