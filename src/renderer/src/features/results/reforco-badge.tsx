import { CheckCircle2, Loader2, Sparkles, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReforcoStore } from '@/stores/reforco-store'

/**
 * O reforço automático, no cabeçalho.
 *
 * No cabeçalho e não numa aba porque ele roda em segundo plano enquanto a
 * pessoa já está olhando outra coisa — o resultado do episódio, ou a tela de
 * batismo do próximo. Some sozinho quando não há nada pra contar; o
 * resultado fica até ser dispensado, pra não sumir antes de ser lido.
 */
export function ReforcoBadge(): JSX.Element | null {
  const { rotulo, rodando, progresso, resultado, erro, dispensar } = useReforcoStore()

  if (!rodando && !resultado && !erro) return null

  const texto = rodando
    ? progresso?.total
      ? `Reforçando refs · ${progresso.nome} ${progresso.feitos}/${progresso.total}`
      : 'Reforçando refs…'
    : erro
      ? 'Reforço falhou'
      : `+${resultado?.total ?? 0} refs`

  const dica = rodando
    ? `Guardando os rostos mais confiáveis de ${rotulo} como referência`
    : erro
      ? `${rotulo}: ${erro}`
      : resultado
        ? `${rotulo}: ${resultado.total} referências novas em ${resultado.characters} ` +
          `${resultado.characters === 1 ? 'personagem' : 'personagens'}\n` +
          Object.entries(resultado.added)
            .map(([nome, n]) => `${nome} +${n}`)
            .join('\n')
        : ''

  return (
    <div
      title={dica}
      className={cn(
        'flex h-8 max-w-[300px] items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold',
        erro
          ? 'border-warning/25 bg-warning/10 text-warning'
          : 'border-primary/25 bg-primary/10 text-primary'
      )}
    >
      {rodando ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
      ) : erro ? (
        <TriangleAlert className="size-3.5 shrink-0" />
      ) : resultado && resultado.total > 0 ? (
        <CheckCircle2 className="size-3.5 shrink-0" />
      ) : (
        <Sparkles className="size-3.5 shrink-0" />
      )}
      <span className="truncate">{texto}</span>
      {!rodando && (
        <button
          type="button"
          aria-label="Dispensar"
          onClick={dispensar}
          className="grid size-4 shrink-0 place-items-center rounded opacity-70 hover:opacity-100"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}
