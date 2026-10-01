/**
 * Optimized Bitsliced Serpent-256 implementation.
 */

const rotateLeft = (n: number, bits: number) => (n << bits) | (n >>> (32 - bits));

const LT = (v: number[]): number[] => {
  let a = v[0], b = v[1], c = v[2], d = v[3];
  a = rotateLeft(a, 13);
  c = rotateLeft(c, 3);
  b = rotateLeft(b ^ a ^ c, 1);
  d = rotateLeft(d ^ c ^ (a << 3), 7);
  a = rotateLeft(a ^ b ^ d, 5);
  c = rotateLeft(c ^ d ^ (b << 7), 22);
  return [a, b, c, d];
};

const S0 = (a: number, b: number, c: number, d: number) => {
  const t01 = a ^ d, t02 = a & d, t03 = c ^ t01, t06 = b | t01, t07 = a ^ (b & t03), t08 = b ^ t02, t09 = t08 | t07, t11 = d ^ t08, t15 = t03 ^ t09;
  return [t07, t11, t06 ^ (c | t07), t15];
};

const S1 = (a: number, b: number, _c: number, d: number) => {
  const t01 = b ^ d, t02 = a ^ b, t05 = d ^ (a & t01), t06 = b ^ (a & t05), t11 = t02 ^ (t05 & t06), t14 = t01 ^ (t06 | t11);
  return [t05, t06, t11, t14 ^ (a | t02)];
};

const S2 = (a: number, b: number, c: number, d: number) => {
  const t01 = ~a, t02 = b ^ d, t03 = c & t01, t05 = c ^ t02, t08 = d ^ (t01 | t05), t09 = b ^ (t01 & t08), t13 = t02 ^ (t03 & t09);
  return [t05, t08, t09, t13 ^ (c | t08)];
};

const S3 = (a: number, b: number, c: number, d: number) => {
  const t01 = a ^ b, t02 = a | c, t03 = a ^ d, t04 = c ^ (t01 & t02), t05 = d ^ (a & t04), t06 = t01 ^ t04, t08 = t01 | t05, t11 = t03 ^ (t06 & t08), t14 = t04 ^ (t05 & t11);
  return [t05, t06, t11, t14 ^ (t04 & t11)];
};

const S4 = (a: number, b: number, c: number, d: number) => {
  const t01 = a ^ c, t02 = a ^ d, t03 = b ^ (t01 & t02), t04 = d ^ t01, t07 = t01 ^ (b | t04), t08 = b ^ (t04 & t07), t11 = a ^ (t03 & t08), t14 = t03 ^ (t08 | t11);
  return [t03, t08, t11, t14];
};

const S5 = (a: number, b: number, c: number, d: number) => {
  const t01 = ~a, t02 = a ^ b, t03 = a ^ d, t04 = c ^ t01, t05 = t02 ^ t03, t08 = d ^ (t02 | (t03 & t05)), t09 = t05 ^ (c & t08), t13 = t02 ^ (t08 | t09);
  return [t08, t09, t13, t13 ^ (t04 ^ (t08 & t09))];
};

const S6 = (a: number, b: number, c: number, d: number) => {
  const t01 = ~a, t02 = a ^ b, t03 = c ^ t02, t04 = c | t01, t05 = d ^ t04, t07 = b ^ (d | t03), t08 = t03 ^ t05, t11 = t02 ^ (t05 & t07), t15 = t05 ^ (t08 & t11);
  return [t08, t11, t15, t15 ^ (t07 ^ (t08 | t11))];
};

const S7 = (a: number, b: number, c: number, d: number) => {
  const t01 = ~c, t02 = b ^ c, t03 = b | t01, t04 = a ^ t03, t05 = a & t02, t07 = d ^ (t04 | t05), t08 = b ^ (t05 | t07), t11 = t04 ^ (t07 & t08), t14 = t02 ^ (t08 & t11);
  return [t07, t08, t11, t14];
};

const S_BOXES = [S0, S1, S2, S3, S4, S5, S6, S7];

export class Serpent {
  private subkeys: number[][];

  constructor(key: Uint8Array) {
    if (key.length !== 32) throw new Error("Key must be 256 bits");
    this.subkeys = this.expandKey(key);
  }

  // Pre-expand key to avoid repeating work
  static fromKey(key: Uint8Array): Serpent {
    return new Serpent(key);
  }

  private expandKey(key: Uint8Array): number[][] {
    const w = new Int32Array(132);
    for (let i = 0; i < 8; i++) {
      w[i] = (key[i * 4] | (key[i * 4 + 1] << 8) | (key[i * 4 + 2] << 16) | (key[i * 4 + 3] << 24));
    }
    const phi = 0x9e3779b9;
    for (let i = 8; i < 132; i++) {
      let tmp = w[i - 8] ^ w[i - 5] ^ w[i - 3] ^ w[i - 1] ^ phi ^ (i - 8);
      w[i] = rotateLeft(tmp, 11);
    }

    const subkeys: number[][] = [];
    for (let i = 0; i < 33; i++) {
      const sbIndex = (35 - i) % 8;
      const res = S_BOXES[sbIndex](w[i * 4 + 8], w[i * 4 + 9], w[i * 4 + 10], w[i * 4 + 11]);
      subkeys.push(res);
    }
    return subkeys;
  }

  encryptBlock(input: Uint8Array, offset: number): Uint32Array {
    let a = (input[offset] | (input[offset + 1] << 8) | (input[offset + 2] << 16) | (input[offset + 3] << 24));
    let b = (input[offset + 4] | (input[offset + 5] << 8) | (input[offset + 6] << 16) | (input[offset + 7] << 24));
    let c = (input[offset + 8] | (input[offset + 9] << 8) | (input[offset + 10] << 16) | (input[offset + 11] << 24));
    let d = (input[offset + 12] | (input[offset + 13] << 8) | (input[offset + 14] << 16) | (input[offset + 15] << 24));

    for (let i = 0; i < 31; i++) {
      a ^= this.subkeys[i][0]; b ^= this.subkeys[i][1]; c ^= this.subkeys[i][2]; d ^= this.subkeys[i][3];
      const res = S_BOXES[i % 8](a, b, c, d);
      const lt = LT(res);
      a = lt[0]; b = lt[1]; c = lt[2]; d = lt[3];
    }

    a ^= this.subkeys[31][0]; b ^= this.subkeys[31][1]; c ^= this.subkeys[31][2]; d ^= this.subkeys[31][3];
    const res7 = S_BOXES[7](a, b, c, d);
    a = res7[0] ^ this.subkeys[32][0];
    b = res7[1] ^ this.subkeys[32][1];
    c = res7[2] ^ this.subkeys[32][2];
    d = res7[3] ^ this.subkeys[32][3];

    return new Uint32Array([a, b, c, d]);
  }
}

// Optimized CTR with potential WASM bridge
/**
 * HYBRID SERPENT-256 ENGINE (WASM + BITSLICED JS)
 */
let wasmInstance: any = null;

export async function initSerpentWasm(wasmBytes: ArrayBuffer) {
  const { instance } = await WebAssembly.instantiate(wasmBytes, {
    env: { memory: new WebAssembly.Memory({ initial: 256 }) }
  });
  wasmInstance = instance.exports;
}

export function serpentCTR(key: Uint8Array, nonce: Uint8Array, data: Uint8Array, instance?: Serpent): Uint8Array {
  if (wasmInstance?.serpent_ctr) {
    // Shared buffer approach for maximum performance
    const keyPtr = wasmInstance.alloc(32);
    const noncePtr = wasmInstance.alloc(16);
    const dataPtr = wasmInstance.alloc(data.length);
    
    new Uint8Array(wasmInstance.memory.buffer, keyPtr, 32).set(key);
    new Uint8Array(wasmInstance.memory.buffer, noncePtr, 16).set(nonce);
    new Uint8Array(wasmInstance.memory.buffer, dataPtr, data.length).set(data);
    
    wasmInstance.serpent_ctr(keyPtr, noncePtr, dataPtr, data.length);
    const out = new Uint8Array(wasmInstance.memory.buffer, dataPtr, data.length).slice();
    
    wasmInstance.free(keyPtr); wasmInstance.free(noncePtr); wasmInstance.free(dataPtr);
    return out;
  }

  const serpent = instance || new Serpent(key);
  const out = new Uint8Array(data.length);
  const counter = new Uint8Array(16);
  counter.set(nonce);
  const ks8 = new Uint8Array(16);
  const view = new DataView(ks8.buffer);

  for (let i = 0; i < data.length; i += 16) {
    const ks32 = serpent.encryptBlock(counter, 0);
    view.setUint32(0, ks32[0], true);
    view.setUint32(4, ks32[1], true);
    view.setUint32(8, ks32[2], true);
    view.setUint32(12, ks32[3], true);

    const len = Math.min(16, data.length - i);
    for (let j = 0; j < len; j++) {
      out[i + j] = data[i + j] ^ ks8[j];
    }
    for (let j = 8; j < 16; j++) {
      if (++counter[j] !== 0) break;
    }
  }
  return out;
}
