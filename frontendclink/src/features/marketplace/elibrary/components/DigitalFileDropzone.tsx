import { PublicationUpload } from '../../components/PublicationFormUI';

export interface DigitalFileDropzoneProps { disabled: boolean; busy: boolean; onChoose: () => void; onDropFiles: (files: File[]) => void }

export function DigitalFileDropzone({ disabled, busy, onChoose }: DigitalFileDropzoneProps) {
  return <PublicationUpload label="Seleccionar archivos PDF" hint="PDF · Hasta 25 MB por archivo" disabled={disabled} busy={busy} onPress={onChoose} />;
}
