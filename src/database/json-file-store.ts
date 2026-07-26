import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class JsonFileStore {
  public async read<T>(path: string, fallback: T): Promise<T> {
    try { return JSON.parse(await readFile(path, 'utf8')) as T; }
    catch (error: unknown) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
  }
  public async write<T>(path: string, value: T): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, path);
  }
}
