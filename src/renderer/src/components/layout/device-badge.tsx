import { Cpu, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Selo de dispositivo: verde com o nome da GPU, ou âmbar avisando que está
 * em CPU (~20x mais lento). O nome vem encurtado — "NVIDIA GeForce RTX 3060"
 * não cabe no cabeçalho.
 */
export function DeviceBadge({ gpuName }: { gpuName: string | null }): JSX.Element {
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
