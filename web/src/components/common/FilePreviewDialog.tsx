import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Download, ExternalLink, FileQuestion } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/spinner';
import { getApiErrorMessage, obtenerArchivoPrivado } from '@/api/client';

export interface FilePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  titulo?: string;
  soporteUrl: string | null;
  nombreArchivo?: string;
}

type Estado = 'loading' | 'ready' | 'error';

/** Nombre de archivo derivado del último segmento de la ruta. */
function nombreDesdeUrl(url: string): string {
  const sinQuery = url.split('?')[0];
  const segmento = sinQuery.split('/').filter(Boolean).pop();
  return segmento || 'archivo';
}

export function FilePreviewDialog({
  open,
  onClose,
  titulo,
  soporteUrl,
  nombreArchivo,
}: FilePreviewDialogProps) {
  const [estado, setEstado] = useState<Estado>('loading');
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [tipo, setTipo] = useState('');
  const [intento, setIntento] = useState(0);

  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !soporteUrl) return;

    let cancelled = false;
    setEstado('loading');
    setError(null);

    obtenerArchivoPrivado(soporteUrl)
      .then((blob) => {
        if (cancelled) return;
        const url = window.URL.createObjectURL(blob);
        blobRef.current = blob;
        urlRef.current = url;
        setTipo(blob.type);
        setObjectUrl(url);
        setEstado('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(getApiErrorMessage(err));
        setEstado('error');
      });

    return () => {
      cancelled = true;
      if (urlRef.current) {
        window.URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      blobRef.current = null;
      setObjectUrl(null);
    };
  }, [open, soporteUrl, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  const nombre = nombreArchivo?.trim() || (soporteUrl ? nombreDesdeUrl(soporteUrl) : 'archivo');

  function descargar() {
    const blob = blobRef.current;
    if (!blob) return;
    // URL efímera solo para la descarga: no afecta la vista previa y se revoca al usarla.
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombre;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  function abrirEnPestana() {
    // El object URL ya existe (sin await), así que el bloqueador de popups no
    // puede intervenir: la apertura es síncrona dentro del click del usuario.
    if (objectUrl) window.open(objectUrl, '_blank', 'noopener,noreferrer');
  }

  const esImagen = tipo.startsWith('image/');
  const esPdf = tipo === 'application/pdf';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={titulo ?? 'Vista previa'}
      className="sm:max-w-3xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          {estado === 'ready' && objectUrl && (
            <Button variant="outline" onClick={abrirEnPestana}>
              <ExternalLink className="h-4 w-4" />
              Abrir en pestaña nueva
            </Button>
          )}
          <Button onClick={descargar} disabled={estado !== 'ready'}>
            <Download className="h-4 w-4" />
            Descargar
          </Button>
        </>
      }
    >
      {!soporteUrl ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No hay ningún archivo para mostrar.
        </p>
      ) : estado === 'loading' ? (
        <LoadingState label="Cargando archivo…" />
      ) : estado === 'error' ? (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="font-medium">No se pudo abrir el archivo</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={reintentar}>
            Reintentar
          </Button>
        </div>
      ) : esImagen ? (
        <div className="flex max-h-[70vh] items-center justify-center overflow-hidden rounded-md border bg-muted/30">
          <img
            src={objectUrl ?? undefined}
            alt={nombre}
            className="max-h-[70vh] w-full object-contain"
          />
        </div>
      ) : esPdf ? (
        <iframe
          src={objectUrl ?? undefined}
          title={nombre}
          className="h-[70vh] w-full rounded-md border bg-background"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FileQuestion className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="font-medium">No es posible previsualizar este archivo</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              El formato de este archivo no admite vista previa. Puede descargarlo para verlo.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={descargar}>
            <Download className="h-4 w-4" />
            Descargar
          </Button>
        </div>
      )}
    </Dialog>
  );
}
