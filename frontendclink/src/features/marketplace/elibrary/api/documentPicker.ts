import { getDocumentAsync } from 'expo-document-picker';
import { File as LocalFile } from 'expo-file-system';
import { DIGITAL_MAX_BYTES, type DigitalFile } from '../types/publication';

export async function pickDigitalFiles(): Promise<DigitalFile[]> {
  const result = await getDocumentAsync({ type: 'application/pdf', multiple: true, copyToCacheDirectory: true, base64: false });
  if (result.canceled) return [];
  const files = result.assets.map(asset => ({ name: asset.name, uri: asset.uri,
    sizeBytes: asset.size ?? asset.file?.size ?? new LocalFile(asset.uri).size, webFile: asset.file, mimeType: asset.mimeType }));
  if (files.some(file => !file.sizeBytes || file.sizeBytes > DIGITAL_MAX_BYTES || !/\.pdf$/i.test(file.name)
    || (file.mimeType && file.mimeType !== 'application/pdf'))) {
    files.forEach(releaseDigitalFile);
    throw new Error('Cada archivo debe ser un PDF de hasta 25 MB.');
  }
  return files.map(({ mimeType: _, ...file }) => file);
}
export function releaseDigitalFile(file: DigitalFile) {
  if (file.webFile && file.uri.startsWith('blob:')) URL.revokeObjectURL(file.uri);
}
