import { getDocumentAsync } from 'expo-document-picker';
import { File as LocalFile } from 'expo-file-system';
import { DIGITAL_MAX_BYTES, type DigitalFile } from '../types/publication';

export async function pickDigitalFile(): Promise<DigitalFile | null> {
  const result = await getDocumentAsync({ type: 'application/pdf', multiple: false, copyToCacheDirectory: true, base64: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const sizeBytes = asset.size ?? asset.file?.size ?? new LocalFile(asset.uri).size;
  if (!sizeBytes || sizeBytes > DIGITAL_MAX_BYTES) throw new Error('Selecciona un PDF de hasta 25 MB.');
  if (!/\.pdf$/i.test(asset.name) || (asset.mimeType && asset.mimeType !== 'application/pdf')) throw new Error('Por ahora se admiten archivos PDF.');
  return { name: asset.name, uri: asset.uri, sizeBytes, webFile: asset.file };
}
