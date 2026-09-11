import { Cpu, Loader2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AppInfo } from '@shared/types'

/**
 * Selo de dispositivo: verde com o nome da GPU, ou âmbar avisando que está
 * em CPU (~20x mais lento). O nome vem encurtado — "NVIDIA GeForce RTX 3060"
 * não cabe no cabeçalho.
 *
 * `info` nulo é um TERCEIRO estado, não a ausência de GPU. Quem responde
 * "tem placa?" é o motor, e ele leva ~2s pra subir; enquanto isso o selo
 * mostrava "CPU (lento)" em âmbar, ou seja, afirmava não haver placa antes
 * de ter perguntado. Quem abre o app e olha o cabeçalho de cara lê que a
 * própria 3060 sumiu — e o selo depois conserta sozinho, o que é pior:
 * parece defeito intermitente da máquina.
 */
export function DeviceBadge({ info }: { info: AppInfo | null }): JSX.Element {
  if (!info) {
    return (
      <div
        title="Perguntando ao motor se há GPU disponível…"
        className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface-sunken px-2.5 text-[12px] font-semibold text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        Verificando
      </div>
    )
  }

  const gpuName = info.gpuName
  const onGpu = Boolean(gpuName)
  const label = onGpu ? shortenGpu(gpuName as string) : 'CPU (lento)'

  return (
    <div
      title={
        onGpu
          ? 'Rodando em GPU NVIDIA (rápido).'
          : 'Sem GPU detectada — roda em CPU, cerca de 20x mais lento.'
      }
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold',
        onGpu
          ? 'border-primary/25 bg-primary/10 text-primary'
          : 'border-warning/25 bg-warning/10 text-warning'
      )}
    >
      {onGpu ? <Zap className="size-3.5" /> : <Cpu className="size-3.5" />}
      {label}
    </div>
  )
}

function shortenGpu(name: string): string {
  return name.replace(/NVIDIA\s+/i, '').replace(/GeForce\s+/i, '').trim()
}
