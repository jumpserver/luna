interface Sha256State {
  h: number[];
  buffer: number[];
  length: number;
}

interface ChecksumRequest {
  id: string;
  kind: "update" | "finalize";
  state: string;
  data?: ArrayBuffer;
}

interface ChecksumWorkerScope {
  onmessage: ((event: MessageEvent<ChecksumRequest>) => void) | null;
  postMessage: (message: unknown) => void;
}

const workerScope = globalThis as unknown as ChecksumWorkerScope;

const initialHash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

const constants = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function rightRotate(value: number, shift: number) {
  return (value >>> shift) | (value << (32 - shift));
}

function parseState(value: string): Sha256State {
  if (!value) return { h: [...initialHash], buffer: [], length: 0 };

  const state = JSON.parse(value) as Sha256State;
  if (state.h.length !== 8 || state.buffer.length >= 64 || !Number.isSafeInteger(state.length)) {
    throw new Error("Invalid file transfer checksum state");
  }

  return state;
}

function processBlock(state: Sha256State, block: Uint8Array) {
  const words = new Uint32Array(64);

  for (let index = 0; index < 16; index++) {
    const offset = index * 4;
    words[index] =
      ((block[offset] ?? 0) << 24) |
      ((block[offset + 1] ?? 0) << 16) |
      ((block[offset + 2] ?? 0) << 8) |
      (block[offset + 3] ?? 0);
  }

  for (let index = 16; index < 64; index++) {
    const word15 = words[index - 15] ?? 0;
    const word2 = words[index - 2] ?? 0;
    const sigma0 = rightRotate(word15, 7) ^ rightRotate(word15, 18) ^ (word15 >>> 3);
    const sigma1 = rightRotate(word2, 17) ^ rightRotate(word2, 19) ^ (word2 >>> 10);
    words[index] = ((words[index - 16] ?? 0) + sigma0 + (words[index - 7] ?? 0) + sigma1) >>> 0;
  }

  let [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = state.h;

  for (let index = 0; index < 64; index++) {
    const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
    const choice = (e & f) ^ (~e & g);
    const temp1 = (h + sigma1 + choice + (constants[index] ?? 0) + (words[index] ?? 0)) >>> 0;
    const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const temp2 = (sigma0 + majority) >>> 0;
    h = g;
    g = f;
    f = e;
    e = (d + temp1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temp1 + temp2) >>> 0;
  }

  const output = [a, b, c, d, e, f, g, h];
  state.h = state.h.map((value, index) => (value + (output[index] ?? 0)) >>> 0);
}

function update(state: Sha256State, bytes: Uint8Array) {
  const combined = new Uint8Array(state.buffer.length + bytes.length);
  combined.set(state.buffer);
  combined.set(bytes, state.buffer.length);
  state.length += bytes.length;

  let offset = 0;
  while (offset + 64 <= combined.length) {
    processBlock(state, combined.subarray(offset, offset + 64));
    offset += 64;
  }

  state.buffer = Array.from(combined.subarray(offset));
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function finalize(source: Sha256State) {
  const state: Sha256State = { h: [...source.h], buffer: [...source.buffer], length: source.length };
  const bitLength = BigInt(state.length) * 8n;
  const paddingLength = state.buffer.length < 56 ? 56 - state.buffer.length : 120 - state.buffer.length;
  const padding = new Uint8Array(paddingLength + 8);
  padding[0] = 0x80;

  for (let index = 0; index < 8; index++) {
    padding[padding.length - 1 - index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
  }

  update(state, padding);

  const result = new Uint8Array(32);
  state.h.forEach((value, index) => {
    result[index * 4] = value >>> 24;
    result[index * 4 + 1] = value >>> 16;
    result[index * 4 + 2] = value >>> 8;
    result[index * 4 + 3] = value;
  });

  return hex(result);
}

workerScope.onmessage = async (event) => {
  try {
    const request = event.data;
    const state = parseState(request.state);

    if (request.kind === "finalize") {
      workerScope.postMessage({ id: request.id, checksum: finalize(state), state: JSON.stringify(state) });
      return;
    }

    const bytes = new Uint8Array(request.data || new ArrayBuffer(0));
    const chunkChecksum = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));

    update(state, bytes);
    workerScope.postMessage({ id: request.id, chunkChecksum, state: JSON.stringify(state) });
  } catch (error) {
    workerScope.postMessage({ id: event.data.id, error: error instanceof Error ? error.message : String(error) });
  }
};
