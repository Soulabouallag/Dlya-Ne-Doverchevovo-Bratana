export const HEADER_FAKE_SIZE = 64;
export const HEADER_LEN_SIZE = 4;
export const SALTS_SIZE = 192; // 6 * 32
export const ENC_PARAMS_SIZE = 116;
export const HEADER_TOTAL_SIZE = HEADER_FAKE_SIZE + HEADER_LEN_SIZE + SALTS_SIZE + ENC_PARAMS_SIZE; // 376

// Layer Overheads:
// L4: 12 (IV) + 16 (Tag) + 64 (HMAC) = 92
// L3: 16 (Nonce) + 64 (HMAC) = 80
// L2: 12 (Nonce) + 16 (Tag) + 64 (HMAC) = 92
// L1: 12 (IV) + 16 (Tag) + 64 (HMAC) = 92
export const CHUNK_OVERHEAD = 92 + 80 + 92 + 92; // 356
export const MASTER_KEY_SIZE = 64;
export const KDF_ITERATIONS_PER_CHAIN = 600000;
export const KDF_CHAINS = 6;
