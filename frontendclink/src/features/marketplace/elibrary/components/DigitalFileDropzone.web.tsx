import { useState } from 'react';
import { PublicationUpload } from '../../components/PublicationFormUI';
import type { DigitalFileDropzoneProps } from './DigitalFileDropzone';

export function DigitalFileDropzone({ disabled, busy, onChoose, onDropFiles }: DigitalFileDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  return <div style={{ width: '100%' }} onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)}
    onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled && event.dataTransfer.files.length) onDropFiles(Array.from(event.dataTransfer.files)); }}>
    <PublicationUpload label="Seleccionar archivos PDF" hint={dragging ? 'Suelta tus PDF aquí' : 'Arrastra tus PDF aquí o pulsa para seleccionarlos · Hasta 25 MB por archivo'} disabled={disabled} busy={busy} onPress={onChoose} />
  </div>;
}
