import { lstat, mkdir, open, realpath, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';

const LABEL_RE = /^Phase3-CR[123]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FORBIDDEN_KEY_PARTS = [
  'token',
  'password',
  'credential',
  'privatekey',
  'sourceip',
  'rawbody',
  'pairingcode',
] as const;

export interface EvidenceDirectoryIdentity {
  readonly realPath: string;
  readonly device: number;
  readonly inode: number;
}

export interface Phase3EvidenceReservation {
  readonly path: string;
  readonly directory: EvidenceDirectoryIdentity;
  readonly fileDevice: number;
  readonly fileInode: number;
  readonly handle: FileHandle;
  consumed: boolean;
}

export async function securePhase3EvidenceDirectory(
  directory: string,
): Promise<EvidenceDirectoryIdentity> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const [resolved, metadata] = await Promise.all([realpath(directory), lstat(directory)]);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('evidence directory must be a real directory');
  }
  if ((metadata.mode & 0o777) !== 0o700) {
    throw new Error('evidence directory must have mode 0700');
  }
  return { realPath: resolved, device: metadata.dev, inode: metadata.ino };
}

export async function reservePhase3EvidenceFile(
  directory: EvidenceDirectoryIdentity,
  label: string,
  runAttemptId: string,
): Promise<Phase3EvidenceReservation> {
  requireEvidenceIdentity(label, runAttemptId);
  await requireSameDirectory(directory);
  const path = join(directory.realPath, `${label.toLowerCase()}-${runAttemptId}.json`);
  const handle = await open(path, 'wx+', 0o600);
  const metadata = await handle.stat();
  if (metadata.size !== 0) {
    await handle.close().catch(() => undefined);
    throw new Error('reserved evidence file is not empty');
  }
  return {
    path,
    directory,
    fileDevice: metadata.dev,
    fileInode: metadata.ino,
    handle,
    consumed: false,
  };
}

export function serializePhase3Evidence(evidence: unknown): string {
  inspect(evidence);
  if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence)) {
    throw new Error('evidence must be an object');
  }
  const authorizes = (evidence as Record<string, unknown>)['authorizes'];
  if (typeof authorizes !== 'string' || !/\bNothing\b/.test(authorizes)) {
    throw new Error('evidence must explicitly authorize nothing');
  }
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

export async function writePhase3Evidence(
  reservation: Phase3EvidenceReservation,
  evidence: unknown,
): Promise<string> {
  if (reservation.consumed) throw new Error('evidence reservation already consumed');
  const serialized = serializePhase3Evidence(evidence);
  const bytes = Buffer.from(serialized, 'utf8');
  await requireSameDirectory(reservation.directory);
  await requireSameFile(reservation, 0);
  reservation.consumed = true;
  try {
    await reservation.handle.truncate(0);
    const written = await reservation.handle.write(bytes, 0, bytes.length, 0);
    if (written.bytesWritten !== bytes.length) throw new Error('evidence write was incomplete');
    await reservation.handle.truncate(bytes.length);
    await reservation.handle.sync();
    await requireSameFile(reservation, bytes.length);
    const readback = Buffer.alloc(bytes.length);
    const read = await reservation.handle.read(readback, 0, readback.length, 0);
    if (read.bytesRead !== bytes.length || !readback.equals(bytes)) {
      throw new Error('evidence read-back verification failed');
    }
    return reservation.path;
  } finally {
    await reservation.handle.close().catch(() => undefined);
  }
}

export async function disposePhase3EvidenceReservation(
  reservation: Phase3EvidenceReservation,
): Promise<void> {
  reservation.consumed = true;
  await reservation.handle.close().catch(() => undefined);
}

function requireEvidenceIdentity(label: string, runAttemptId: string): void {
  if (!LABEL_RE.test(label) || !UUID_RE.test(runAttemptId)) {
    throw new Error('invalid evidence identity');
  }
}

async function requireSameDirectory(expected: EvidenceDirectoryIdentity): Promise<void> {
  let current: EvidenceDirectoryIdentity;
  try {
    current = await securePhase3EvidenceDirectory(expected.realPath);
  } catch {
    throw new Error('evidence directory identity changed');
  }
  if (
    current.realPath !== expected.realPath ||
    current.device !== expected.device ||
    current.inode !== expected.inode
  ) {
    throw new Error('evidence directory identity changed');
  }
}

async function requireSameFile(
  reservation: Phase3EvidenceReservation,
  expectedSize: number,
): Promise<void> {
  const [pathMetadata, handleMetadata] = await Promise.all([
    lstat(reservation.path),
    reservation.handle.stat(),
  ]);
  if (
    !pathMetadata.isFile() ||
    pathMetadata.isSymbolicLink() ||
    pathMetadata.dev !== reservation.fileDevice ||
    pathMetadata.ino !== reservation.fileInode ||
    handleMetadata.dev !== reservation.fileDevice ||
    handleMetadata.ino !== reservation.fileInode ||
    pathMetadata.size !== expectedSize ||
    handleMetadata.size !== expectedSize
  ) {
    throw new Error(
      expectedSize === 0 ? 'reserved evidence file is not empty' : 'evidence file reservation changed',
    );
  }
}

function inspect(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) inspect(item);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (FORBIDDEN_KEY_PARTS.some((part) => normalized.includes(part))) {
      throw new Error(`forbidden evidence key: ${key}`);
    }
    inspect(item);
  }
}
