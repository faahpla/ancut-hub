import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUpdateStore } from '@/stores/update-store'

/**
 * "Procurar atualizações" no rodapé das Configurações.
 *
 * Só dispara a checagem e mostra o resultado em texto. Quem abre o diálogo é
 * o store (o mesmo que a pílula do cabeçalho usa), pra existir um diálogo só.
 */
export function UpdateCheckButton(): JSX.Element {
  const { status, check, setOpen } = useUpdateStore()
  const phase = status?.phase ?? 'idle'

  if (!status?.supported) {
    return (
      <span className="text-[11.5px] text-muted-foreground">
        Atualização automática só no app instalado
      </span>
    )
  }

  if (
    phase === 'available' ||
    phase === 'downloading' ||
    phase === 'ready' ||
    phase === 'applying'
  ) {
    return (
      <Button variant="ghost" size="sm" className="text-primary" onClick={() => setOpen(true)}>
        Versão {status.manifest?.version} disponível
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {phase === 'up-to-date' && (
        <span className="text-[11.5px] text-muted-foreground">Você está na mais recente</span>
      )}
      {phase === 'error' && (
        <span className="text-[11.5px] text-destructive">{status.error}</span>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={phase === 'checking'}
        onClick={() => void check()}
      >
        {phase === 'checking' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Procurar atualizações
      </Button>
    </div>
  )
}
