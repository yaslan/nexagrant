import { describe, it, expect } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  verifyDeployedBytecode,
  normalizeCborMetadata,
  extractBytecodeSelectors,
  AbiItem,
  ContractArtifact,
} from '../scripts/verify-deployed-bytecode';

const ARTIFACT_PATH = path.resolve(process.cwd(), 'src/contracts/artifacts/DualApproval.json');

describe('Deployed Bytecode ↔ ABI Verification Gate', () => {
  it('GREEN PASS: Returns success on exact matching deployed bytecode and ABI', async () => {
    const rawArtifact = fs.readFileSync(ARTIFACT_PATH, 'utf8');
    const artifact: ContractArtifact = JSON.parse(rawArtifact);

    // Simulated chain bytecode with a different immutable value at offset 32 (deployed value)
    const deployedBytecodeHex = artifact.deployedBytecode!;
    const chainBytecodeBuf = Buffer.from(deployedBytecodeHex.slice(2), 'hex');

    // Simulate deployed immutable value 86400 (1 day timelock) at offset 89 in place of 0
    chainBytecodeBuf.writeUInt32BE(86400, 89);

    // Simulate different compiler build CBOR metadata hash at the end (same 53-byte length)
    const bodyHex = chainBytecodeBuf.toString('hex').slice(0, -106);
    const mockMetadataHex = 'a264697066735822' + '9'.repeat(68) + '64736f6c634300081c0033';
    const chainBytecodeHex = '0x' + bodyHex + mockMetadataHex;

    const res = await verifyDeployedBytecode({
      artifactPath: ARTIFACT_PATH,
      contractAddress: '0x7109709ecfa91a80626ff3989d68f67f5b1dd12d',
      mockChainBytecode: chainBytecodeHex,
    });

    expect(res.success).toBe(true);
    expect(res.byteMatch).toBe(true);
    expect(res.selectorMatch).toBe(true);
    expect(res.missingSelectorsInBytecode).toHaveLength(0);
    expect(res.missingSelectorsInAbi).toHaveLength(0);
    expect(res.normalizations).toHaveLength(2); // 1 CBOR metadata + 1 Immutable slot
  });

  it('RED FAIL 1 (Bytecode Mutation): Fails when 1 byte in executable code is mutated', async () => {
    const rawArtifact = fs.readFileSync(ARTIFACT_PATH, 'utf8');
    const artifact: ContractArtifact = JSON.parse(rawArtifact);

    const buf = Buffer.from(artifact.deployedBytecode!.slice(2), 'hex');
    // Mutate byte at executable opcode offset 12 (0x10 -> 0x99)
    buf[12] = 0x99;

    const res = await verifyDeployedBytecode({
      artifactPath: ARTIFACT_PATH,
      contractAddress: '0x7109709ecfa91a80626ff3989d68f67f5b1dd12d',
      mockChainBytecode: '0x' + buf.toString('hex'),
    });

    expect(res.success).toBe(false);
    expect(res.byteMatch).toBe(false);
    expect(res.firstDiffOffset).toBe(12);
    expect(res.diffDetails).toContain('Byte mismatch at offset 12');
  });

  it('RED FAIL 2 (ABI Mutation - Function Removal): Fails when a function is deleted from ABI', async () => {
    const rawArtifact = fs.readFileSync(ARTIFACT_PATH, 'utf8');
    const artifact: ContractArtifact = JSON.parse(rawArtifact);

    // Create temp artifact with approveProposal removed from ABI
    const mutatedArtifact: ContractArtifact = {
      ...artifact,
      abi: artifact.abi.filter((item) => item.name !== 'approveProposal'),
    };

    const tempPath = path.resolve(process.cwd(), 'scratch/DualApprovalMutatedAbi.json');
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    fs.writeFileSync(tempPath, JSON.stringify(mutatedArtifact, null, 2), 'utf8');

    try {
      const res = await verifyDeployedBytecode({
        artifactPath: tempPath,
        contractAddress: '0x7109709ecfa91a80626ff3989d68f67f5b1dd12d',
        mockChainBytecode: artifact.deployedBytecode!,
      });

      expect(res.success).toBe(false);
      expect(res.selectorMatch).toBe(false);
      expect(res.missingSelectorsInAbi).toContain('0x30d46608'); // approveProposal selector
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  });

  it('RED FAIL 3 (ABI Mutation - Extra Function): Fails when an extra function is added to ABI', async () => {
    const rawArtifact = fs.readFileSync(ARTIFACT_PATH, 'utf8');
    const artifact: ContractArtifact = JSON.parse(rawArtifact);

    // Add extra fictitious function to ABI
    const extraFunc: AbiItem = {
      name: 'emergencyPause',
      inputs: [{ name: 'reason', type: 'bytes32' }],
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    };

    const mutatedArtifact: ContractArtifact = {
      ...artifact,
      abi: [...artifact.abi, extraFunc],
    };

    const tempPath = path.resolve(process.cwd(), 'scratch/DualApprovalExtraFunc.json');
    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
    fs.writeFileSync(tempPath, JSON.stringify(mutatedArtifact, null, 2), 'utf8');

    try {
      const res = await verifyDeployedBytecode({
        artifactPath: tempPath,
        contractAddress: '0x7109709ecfa91a80626ff3989d68f67f5b1dd12d',
        mockChainBytecode: artifact.deployedBytecode!,
      });

      expect(res.success).toBe(false);
      expect(res.selectorMatch).toBe(false);
      expect(res.missingSelectorsInBytecode).toHaveLength(1);
      expect(res.missingSelectorsInBytecode[0]).toContain('emergencyPause(bytes32)');
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  });

  it('Correctly extracts 4-byte selectors from bytecode dispatch table', () => {
    const selectors = extractBytecodeSelectors(
      '0x608060405234801561001057600080fd5b50600436106100605760003560e01c80630940140a1461006557806330d4660814'
    );
    expect(selectors).toContain('0x0940140a');
    expect(selectors).toContain('0x30d46608');
  });

  it('Normalizes CBOR metadata trailer without breaking opcode body', () => {
    const rawBytecode = '608060405234801561001057600080fdfb00a264697066735822122011223344556677889900aabbccddeeff11223344556677889900aabbccddeeff64736f6c634300081c0033';
    const { normalized, log } = normalizeCborMetadata(rawBytecode);
    expect(log).toBeDefined();
    expect(log?.type).toBe('CBOR_METADATA');
    expect(normalized.endsWith('0'.repeat(106))).toBe(true);
  });
});
