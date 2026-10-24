import { getDocumentAsync } from 'expo-document-picker';
import { File as LocalFile } from 'expo-file-system';
import { DIGITAL_MAX_BYTES, type DigitalFile } from '../types/publication';

function invalidFileMessage(files: { name: string; sizeBytes: number; mimeType?: string }[]) {
  const invalid = files.find(file => !file.sizeBytes || file.sizeBytes > DIGITAL_MAX_BYTES || !/\.pdf$/i.test(file.name)
    || (file.mimeType && file.mimeType !== 'application/pdf'));
  if (!invalid) return null;
  const reason = !/\.pdf$/i.test(invalid.name) || (invalid.mimeType && invalid.mimeType !== 'application/pdf')
    ? 'Solo se admiten archivos PDF.' : !invalid.sizeBytes ? 'El archivo está vacío.' : 'El archivo supera el máximo de 25 MB.';
  return `${invalid.name}: ${reason}`;
}

/** Arrastrar archivos usa las mismas restricciones que el selector, antes de crear URLs locales. */
export function digitalFilesFromWeb(selected: File[]): DigitalFile[] {
  const error = invalidFileMessage(selected.map(file => ({ name: file.name, sizeBytes: file.size, mimeType: file.type })));
  if (error) throw new Error(error);
  return selected.map(file => ({ name: file.name, sizeBytes: file.size, webFile: file, uri: URL.createObjectURL(file) }));
}

export async function pickDigitalFiles(): Promise<DigitalFile[]> {
  const result = await getDocumentAsync({ type: 'application/pdf', multiple: true, copyToCacheDirectory: true, base64: false });
  if (result.canceled) return [];
  const files = result.assets.map(asset => ({ name: asset.name, uri: asset.uri,
    sizeBytes: asset.size ?? asset.file?.size ?? new LocalFile(asset.uri).size, webFile: asset.file, mimeType: asset.mimeType }));
  const error = invalidFileMessage(files);
  if (error) {
    files.forEach(releaseDigitalFile);
    throw new Error(error);
  }
  return files.map(({ mimeType: _, ...file }) => file);
}
export function releaseDigitalFile(file: DigitalFile) {
  if (file.webFile && file.uri.startsWith('blob:')) URL.revokeObjectURL(file.uri);
}

/** Conserva una sola copia por contenido en la selección, aunque cambie el nombre. */
export async function mergeUniqueDigitalFiles(existing: DigitalFile[], selected: DigitalFile[]) {
  const files = [...existing], duplicates: string[] = [], retainedUris = new Set(existing.map(file => file.uri));
  const released = new Set<string>();
  const discard = (file: DigitalFile) => {
    if (!retainedUris.has(file.uri) && !released.has(file.uri)) { releaseDigitalFile(file); released.add(file.uri); }
  };
  const read = async (file: DigitalFile) => new Uint8Array(await (file.webFile ?? new LocalFile(file.uri)).arrayBuffer());
  try {
    for (const candidate of selected) {
      let duplicate = false;
      const sameSize = files.filter(file => file.sizeBytes === candidate.sizeBytes);
      if (sameSize.length) {
        const content = await read(candidate);
        for (const current of sameSize) {
          const previous = await read(current);
          if (content.length === previous.length && content.every((value, index) => value === previous[index])) { duplicate = true; break; }
        }
      }
      if (duplicate) { duplicates.push(candidate.name); discard(candidate); }
      else { files.push(candidate); retainedUris.add(candidate.uri); }
    }
    return { files, duplicates };
  } catch {
    for (const file of selected) if (!existing.some(previous => previous.uri === file.uri) && !released.has(file.uri)) releaseDigitalFile(file);
    throw new Error('No se pudo leer un archivo para comprobar si está repetido. Vuelve a seleccionarlo.');
  }
}
