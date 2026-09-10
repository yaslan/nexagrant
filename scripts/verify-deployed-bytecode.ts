import fs from 'fs';
import path from 'path';

export interface AbiInput {
  name: string;
  type: string;
  components?: AbiInput[];
}

export interface AbiItem {
  type: string;
  name?: string;
  inputs?: AbiInput[];
  outputs?: AbiInput[];
  stateMutability?: string;
}

export interface ImmutableRef {
  start: number;
  length: number;
}

export interface ContractArtifact {
  contractName: string;
  sourceName?: string;
  abi: AbiItem[];
  bytecode?: string;
  deployedBytecode?: string;
  immutableReferences?: Record<string, ImmutableRef[]>;
}

export interface VerificationOptions {
  artifactPath: string;
  contractAddress: string;
  rpcUrl?: string;
  mockChainBytecode?: string;
}

export interface NormalizationLog {
  type: 'CBOR_METADATA' | 'IMMUTABLE_SLOT' | 'CONSTRUCTOR_ARG';
  startByte: number;
  lengthBytes: number;
  rationale: string;
}

export interface VerificationResult {
  success: boolean;
  contractName: string;
  contractAddress: string;
  rpcUrl: string;
  byteMatch: boolean;
  selectorMatch: boolean;
  firstDiffOffset?: number;
  diffDetails?: string;
  abiSelectors: Array<{ name: string; signature: string; selector: string }>;
  bytecodeSelectors: string[];
  missingSelectorsInBytecode: string[];
  missingSelectorsInAbi: string[];
  normalizations: NormalizationLog[];
}

/**
 * Pure Keccak-256 hash algorithm in TypeScript
 */
export function keccak256(input: string | Buffer): string {
  const data = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008088n
  ];

  const R = [
     0, 36,  3, 41, 18,
     1, 44, 10, 45,  2,
    62,  6, 43, 15, 28,
    28, 55, 25, 21, 56,
    27, 20, 39,  8, 14
  ];

  const state = new BigUint64Array(25);
  const blockSize = 136;
  let offset = 0;

  while (offset + blockSize <= data.length) {
    for (let i = 0; i < blockSize / 8; i++) {
      // i < blockSize/8 (17) is always within state's fixed length (25).
      state[i] = state[i]! ^ data.readBigUInt64LE(offset + i * 8);
    }
    permute(state);
    offset += blockSize;
  }

  const pad = Buffer.alloc(blockSize);
  const rem = data.length - offset;
  data.copy(pad, 0, offset, data.length);
  pad[rem] = 0x01;
  // blockSize - 1 is the last valid index of pad (Buffer.alloc(blockSize)).
  pad[blockSize - 1] = pad[blockSize - 1]! | 0x80;

  for (let i = 0; i < blockSize / 8; i++) {
    // Same bound as above: i < blockSize/8 (17) fits state's length (25).
    state[i] = state[i]! ^ pad.readBigUInt64LE(i * 8);
  }
  permute(state);

  function rot64(val: bigint, n: number): bigint {
    const bn = BigInt(n);
    if (bn === 0n) return val;
    return ((val << bn) | (val >> (64n - bn))) & 0xffffffffffffffffn;
  }

  function permute(S: BigUint64Array) {
    for (let round = 0; round < 24; round++) {
      const C = new BigUint64Array(5);
      for (let x = 0; x < 5; x++) {
        // x in [0,4]; max index x+20 = 24, within S's fixed length (25).
        C[x] = S[x]! ^ S[x + 5]! ^ S[x + 10]! ^ S[x + 15]! ^ S[x + 20]!;
      }
      const D = new BigUint64Array(5);
      for (let x = 0; x < 5; x++) {
        // (x+k) % 5 always yields an index in [0,4], within C's fixed length (5).
        D[x] = C[(x + 4) % 5]! ^ rot64(C[(x + 1) % 5]!, 1);
      }
      for (let i = 0; i < 25; i++) {
        // i < 25 fits S's length; i % 5 is in [0,4], within D's length (5).
        S[i] = S[i]! ^ D[i % 5]!;
      }

      const B = new BigUint64Array(25);
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          // x,y in [0,4]: x+y*5 in [0,24] fits S/B (25); y+x*5 in [0,24] fits R (25).
          B[((2 * x + 3 * y) % 5) + y * 5] = rot64(S[x + y * 5]!, R[y + x * 5]!);
        }
      }

      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          // Same bound as above: all B/S indices stay within [0,24].
          S[x + y * 5] = B[x + y * 5]! ^ ((~B[((x + 1) % 5) + y * 5]!) & B[((x + 2) % 5) + y * 5]!);
        }
      }

      // RC has exactly 24 entries and round < 24 (the outer loop bound).
      S[0] = S[0]! ^ RC[round]!;
    }
  }

  const res = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) {
    // i < 4 is within state's fixed length (25).
    res.writeBigUInt64LE(state[i]!, i * 8);
  }
  return res.toString('hex');
}

/**
 * Formats canonical ABI function signature string (e.g., "approveProposal(bytes32,address)")
 */
export function formatAbiSignature(item: AbiItem): string {
  if (!item.name || item.type !== 'function') return '';
  const formatTypes = (inputs?: AbiInput[]): string => {
    if (!inputs || inputs.length === 0) return '';
    return inputs
      .map((inp) => {
        if (inp.type.startsWith('tuple')) {
          const sub = formatTypes(inp.components);
          return `(${sub})${inp.type.slice(5)}`;
        }
        return inp.type;
      })
      .join(',');
  };

  return `${item.name}(${formatTypes(item.inputs)})`;
}

/**
 * Computes 4-byte EVM function selector hex string ("0xXXXXXXXX")
 */
export function computeSelector(signature: string): string {
  const hash = keccak256(signature);
  return '0x' + hash.slice(0, 8);
}

/**
 * Extracts 4-byte function selectors from EVM bytecode by scanning PUSH4 (0x63) opcodes
 */
export function extractBytecodeSelectors(bytecodeHex: string): string[] {
  const clean = bytecodeHex.startsWith('0x') ? bytecodeHex.slice(2) : bytecodeHex;
  const selectors = new Set<string>();

  for (let i = 0; i < clean.length - 9; i += 2) {
    const opcode = clean.slice(i, i + 2);
    if (opcode.toLowerCase() === '63') {
      const candidate = '0x' + clean.slice(i + 2, i + 10).toLowerCase();
      if (/^0x[0-9a-f]{8}$/.test(candidate)) {
        selectors.add(candidate);
      }
    }
  }

  return Array.from(selectors).sort();
}

/**
 * Strips/normalizes Solidity CBOR metadata footer at the end of runtime bytecode
 */
export function normalizeCborMetadata(bytecodeHex: string): { normalized: string; log?: NormalizationLog } {
  const clean = bytecodeHex.startsWith('0x') ? bytecodeHex.slice(2) : bytecodeHex;

  if (clean.length < 10) return { normalized: clean };

  // Last 2 bytes (4 hex chars) encode metadata length L
  const lengthHex = clean.slice(-4);
  const metadataLength = parseInt(lengthHex, 16);

  // Valid metadata length check (Solidity CBOR trailer is typically 30 to 100 bytes)
  if (metadataLength > 10 && metadataLength < 300 && clean.length >= (metadataLength + 2) * 2) {
    const metadataStartByte = (clean.length / 2) - metadataLength - 2;
    const cutoffHexIndex = metadataStartByte * 2;
    const body = clean.slice(0, cutoffHexIndex);
    const zeroed = '0'.repeat((metadataLength + 2) * 2);

    return {
      normalized: body + zeroed,
      log: {
        type: 'CBOR_METADATA',
        startByte: metadataStartByte,
        lengthBytes: metadataLength + 2,
        rationale: `Solidity CBOR metadata trailer (IPFS/bzzr hash & compiler version) at byte offset ${metadataStartByte}..${metadataStartByte + metadataLength + 2} zeroed out for deterministic code comparison.`,
      },
    };
  }

  return { normalized: clean };
}

/**
 * Normalizes immutable variable reference slots specified in artifact
 */
export function normalizeImmutables(
  bytecodeHex: string,
  immutableRefs?: Record<string, ImmutableRef[]>
): { normalized: string; logs: NormalizationLog[] } {
  const clean = bytecodeHex.startsWith('0x') ? bytecodeHex.slice(2) : bytecodeHex;
  const logs: NormalizationLog[] = [];

  if (!immutableRefs) return { normalized: clean, logs };

  const buf = Buffer.from(clean, 'hex');

  for (const [key, refs] of Object.entries(immutableRefs)) {
    for (const ref of refs) {
      if (ref.start + ref.length <= buf.length) {
        buf.fill(0, ref.start, ref.start + ref.length);
        logs.push({
          type: 'IMMUTABLE_SLOT',
          startByte: ref.start,
          lengthBytes: ref.length,
          rationale: `Immutable variable slot "${key}" at byte offset ${ref.start} (${ref.length} bytes) zeroed out for runtime deployment comparison.`,
        });
      }
    }
  }

  return { normalized: buf.toString('hex'), logs };
}

/**
 * Fetches contract runtime bytecode via JSON-RPC eth_getCode call
 */
export async function fetchChainBytecode(rpcUrl: string, address: string): Promise<string> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getCode',
      params: [address, 'latest'],
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC Error (${data.error.code}): ${data.error.message}`);
  }

  return data.result as string;
}

/**
 * Executes full Deployed Bytecode ↔ ABI verification
 */
export async function verifyDeployedBytecode(options: VerificationOptions): Promise<VerificationResult> {
  const { artifactPath, contractAddress, rpcUrl = process.env.ETH_RPC_URL || 'http://localhost:8545', mockChainBytecode } = options;

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact file not found at path: ${artifactPath}`);
  }

  const rawArtifact = fs.readFileSync(artifactPath, 'utf8');
  const artifact: ContractArtifact = JSON.parse(rawArtifact);

  const localBytecodeHex = artifact.deployedBytecode || artifact.bytecode || '';
  if (!localBytecodeHex) {
    throw new Error(`Artifact ${artifact.contractName} does not contain deployedBytecode or bytecode.`);
  }

  // Fetch or mock on-chain bytecode
  const chainBytecodeHex = mockChainBytecode || (await fetchChainBytecode(rpcUrl, contractAddress));

  const normalizations: NormalizationLog[] = [];

  // Step 1: Normalize CBOR metadata
  const localCbor = normalizeCborMetadata(localBytecodeHex);
  const chainCbor = normalizeCborMetadata(chainBytecodeHex);

  if (localCbor.log) normalizations.push(localCbor.log);

  // Step 2: Normalize Immutables
  const localImm = normalizeImmutables(localCbor.normalized, artifact.immutableReferences);
  const chainImm = normalizeImmutables(chainCbor.normalized, artifact.immutableReferences);

  normalizations.push(...localImm.logs);

  const normLocal = localImm.normalized.toLowerCase();
  const normChain = chainImm.normalized.toLowerCase();

  // Step 3: Compare Bytecodes
  const byteMatch = normLocal === normChain;
  let firstDiffOffset: number | undefined;
  let diffDetails: string | undefined;

  if (!byteMatch) {
    const minLen = Math.min(normLocal.length, normChain.length);
    for (let i = 0; i < minLen; i += 2) {
      const localByte = normLocal.slice(i, i + 2);
      const chainByte = normChain.slice(i, i + 2);
      if (localByte !== chainByte) {
        firstDiffOffset = i / 2;
        diffDetails = `Byte mismatch at offset ${firstDiffOffset} (0x${firstDiffOffset.toString(16)}): Local artifact byte = 0x${localByte}, On-chain byte = 0x${chainByte}.`;
        break;
      }
    }
    if (firstDiffOffset === undefined && normLocal.length !== normChain.length) {
      firstDiffOffset = Math.floor(minLen / 2);
      diffDetails = `Length mismatch: Local normalized bytecode length = ${normLocal.length / 2} bytes, On-chain normalized bytecode length = ${normChain.length / 2} bytes.`;
    }
  }

  // Step 4: Extract and compare ABI selectors vs Bytecode selectors
  const abiSelectorsList = artifact.abi
    .filter((item) => item.type === 'function' && item.name)
    .map((item) => {
      const signature = formatAbiSignature(item);
      return {
        name: item.name!,
        signature,
        selector: computeSelector(signature),
      };
    });

  const abiSelectorSet = new Set(abiSelectorsList.map((s) => s.selector.toLowerCase()));

  // Extract bytecode selectors from chain bytecode (or local if chain empty)
  const chainSelectorsFound = extractBytecodeSelectors(chainCbor.normalized);
  const bytecodeSelectorSet = new Set(chainSelectorsFound.map((s) => s.toLowerCase()));

  const missingSelectorsInBytecode: string[] = [];
  for (const item of abiSelectorsList) {
    if (!bytecodeSelectorSet.has(item.selector.toLowerCase())) {
      missingSelectorsInBytecode.push(`${item.signature} [${item.selector}]`);
    }
  }

  const missingSelectorsInAbi: string[] = [];
  for (const sel of chainSelectorsFound) {
    if (!abiSelectorSet.has(sel.toLowerCase())) {
      missingSelectorsInAbi.push(sel);
    }
  }

  const selectorMatch = missingSelectorsInBytecode.length === 0 && missingSelectorsInAbi.length === 0;

  const success = byteMatch && selectorMatch;

  return {
    success,
    contractName: artifact.contractName || path.basename(artifactPath, '.json'),
    contractAddress,
    rpcUrl,
    byteMatch,
    selectorMatch,
    firstDiffOffset,
    diffDetails,
    abiSelectors: abiSelectorsList,
    bytecodeSelectors: chainSelectorsFound,
    missingSelectorsInBytecode,
    missingSelectorsInAbi,
    normalizations,
  };
}

/**
 * Formats verification result into clean CLI report
 */
export function formatReport(res: VerificationResult): string {
  let out = `=================================================================\n`;
  out += `  EVM DEPLOYED BYTECODE ↔ ABI VERIFICATION GATE REPORT\n`;
  out += `=================================================================\n`;
  out += `Contract Name    : ${res.contractName}\n`;
  out += `Contract Address : ${res.contractAddress}\n`;
  out += `RPC Node URL     : ${res.rpcUrl}\n`;
  out += `Verification     : ${res.success ? '✅ PASS (GREEN)' : '❌ FAIL (RED)'}\n\n`;

  out += `--- 1. BYTECODE MATCH STATUS ---\n`;
  out += `Bytecode Exact Match : ${res.byteMatch ? '✅ MATCH' : '❌ MISMATCH'}\n`;
  if (!res.byteMatch) {
    out += `🚨 ERROR: ${res.diffDetails}\n`;
  }
  out += `\n`;

  out += `--- 2. ABI ↔ BYTECODE SELECTOR OVERLAP ---\n`;
  out += `Selector Match       : ${res.selectorMatch ? '✅ MATCH' : '❌ MISMATCH'}\n`;
  out += `Total ABI Selectors  : ${res.abiSelectors.length}\n`;
  out += `Bytecode Selectors   : ${res.bytecodeSelectors.length}\n`;

  if (res.missingSelectorsInBytecode.length > 0) {
    out += `🚨 SELECTORS IN ABI BUT MISSING IN DEPLOYED BYTECODE:\n`;
    for (const s of res.missingSelectorsInBytecode) {
      out += `   - ${s}\n`;
    }
  }

  if (res.missingSelectorsInAbi.length > 0) {
    out += `🚨 SELECTORS IN DEPLOYED BYTECODE BUT MISSING IN ABI:\n`;
    for (const s of res.missingSelectorsInAbi) {
      out += `   - ${s}\n`;
    }
  }
  out += `\n`;

  out += `--- 3. NORMALIZED BYTE SECTIONS & JUSTIFICATIONS ---\n`;
  if (res.normalizations.length === 0) {
    out += `No byte normalizations were required.\n`;
  } else {
    for (const norm of res.normalizations) {
      out += `[${norm.type}] Start Byte: ${norm.startByte}, Length: ${norm.lengthBytes} bytes\n`;
      out += `  -> Justification: ${norm.rationale}\n`;
    }
  }
  out += `=================================================================\n`;

  return out;
}

// CLI Execution Entrypoint
if (require.main === module) {
  void (async () => {
    const args = process.argv.slice(2);

    const getArg = (flag: string): string | undefined => {
      const idx = args.indexOf(flag);
      return idx !== -1 ? args[idx + 1] : undefined;
    };

    const artifactPath = getArg('--artifact') || 'src/contracts/artifacts/DualApproval.json';
    const contractAddress = getArg('--address') || process.env.CONTRACT_ADDRESS || '0x7109709ecfa91a80626ff3989d68f67f5b1dd12d';
    const rpcUrl = getArg('--rpc') || process.env.ETH_RPC_URL || 'http://localhost:8545';

    console.log(`Executing Deployed Bytecode ↔ ABI Gate verification...`);
    console.log(`Artifact: ${artifactPath}`);
    console.log(`Address : ${contractAddress}`);
    console.log(`RPC     : ${rpcUrl}\n`);

    try {
      const res = await verifyDeployedBytecode({ artifactPath, contractAddress, rpcUrl });
      console.log(formatReport(res));

      if (!res.success) {
        console.error(`❌ GATE FAILED: Deployed bytecode or ABI selectors mismatch!`);
        process.exit(1);
      } else {
        console.log(`✅ GATE PASSED CLEANLY.`);
        process.exit(0);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`🚨 FATAL GATE ERROR: ${msg}`);
      process.exit(1);
    }
  })();
}
