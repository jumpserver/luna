interface Sha256State {
  h: number[]
  buffer: number[]
  length: number
}

interface ChecksumRequest {
  id: string
  kind: "update" | "finalize"
  state: string
  data?: ArrayBuffer
}

interface ChecksumWorkerScope {
  onmessage: ((event: MessageEvent<ChecksumRequest>) => void) | null
  postMessage: (message: unknown) => void
}

const workerScope = globalThis as unknown as ChecksumWorkerScope;

const initialHash = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];

const constants = [
  0x428A2F98,
  0x71374491,
  0xB5C0FBCF,
  0xE9B5DBA5,
  0x3956C25B,
  0x59F111F1,
  0x923F82A4,
  0xAB1C5ED5,
  0xD807AA98,
  0x12835B01,
  0x243185BE,
  0x550C7DC3,
  0x72BE5D74,
  0x80DEB1FE,
  0x9BDC06A7,
  0xC19BF174,
  0xE49B69C1,
  0xEFBE4786,
  0x0FC19DC6,
  0x240CA1CC,
  0x2DE92C6F,
  0x4A7484AA,
  0x5CB0A9DC,
  0x76F988DA,
  0x983E5152,
  0xA831C66D,
  0xB00327C8,
  0xBF597FC7,
  0xC6E00BF3,
  0xD5A79147,
  0x06CA6351,
  0x14292967,
  0x27B70A85,
  0x2E1B2138,
  0x4D2C6DFC,
  0x53380D13,
  0x650A7354,
  0x766A0ABB,
  0x81C2C92E,
  0x92722C85,
  0xA2BFE8A1,
  0xA81A664B,
  0xC24B8B70,
  0xC76C51A3,
  0xD192E819,
  0xD6990624,
  0xF40E3585,
  0x106AA070,
  0x19A4C116,
  0x1E376C08,
  0x2748774C,
  0x34B0BCB5,
  0x391C0CB3,
  0x4ED8AA4A,
  0x5B9CCA4F,
  0x682E6FF3,
  0x748F82EE,
  0x78A5636F,
  0x84C87814,
  0x8CC70208,
  0x90BEFFFA,
  0xA4506CEB,
  0xBEF9A3F7,
  0xC67178F2
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
    words[index]
      = ((block[offset] ?? 0) << 24)
        | ((block[offset + 1] ?? 0) << 16)
        | ((block[offset + 2] ?? 0) << 8)
        | (block[offset + 3] ?? 0);
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
    padding[padding.length - 1 - index] = Number((bitLength >> BigInt(index * 8)) & 0xFFn);
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
