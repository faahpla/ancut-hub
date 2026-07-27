import { FileVideo, FolderOpen } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Panel } from '@/components/ui/panel'
import { useEpisodeStore } from '@/stores/episode-store'
import { cn } from '@/lib/utils'

const VIDEO_RE = /\.(mp4|mkv|mov|avi|webm|ts|m2ts)$/i

export function EpisodeForm({ disabled }: { disabled: boolean }): JSX.Element {
  const ep = useEpisodeStore()
  const [dragging, setDragging] = useState(false)

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = Array.from(e.dataTransfer.files).find((f) => VIDEO_RE.test(f.name))
    if (!file) return
    // `File.path` não existe desde o Electron 32 — o caminho real só vem por
    // webUtils, exposto pelo preload.
    const path = window.ancutFiles.pathFor(file)
    if (path) void ep.applyFile(path)
  }

  const pick = async (): Promise<void> => {
    const path = await window.ancut.dialog.pickVideo()
    if (path) void ep.applyFile(path)
  }

  const pickOut = async (): Promise<void> => {
    const path = await window.ancut.dialog.pickFolder(ep.outputDir)
    if (path) ep.set({ outputDir: path })
  }

  const fileName = ep.videoPath ? ep.videoPath.split(/[\\/]/).pop() : null

  return (
    <Panel step="1" title="Configurações do episódio" compact>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex items-center gap-3 rounded-md border border-dashed px-3 py-2.5 transition-colors',
          dragging
            ? 'border-primary bg-primary/[0.07]'
            : 'border-border/70 bg-surface-sunken/40'
        )}
      >
        <FileVideo
          className={cn('size-4 shrink-0', fileName ? 'text-primary' : 'text-muted-foreground')}
        />
        <span
          className={cn(
            'flex-1 truncate text-[13px]',
            fileName ? 'text-foreground' : 'text-muted-foreground'
          )}
          title={ep.videoPath || undefined}
        >
          {fileName ?? 'Arraste o episódio aqui (.mp4/.mkv) ou clique em Selecionar'}
        </span>
        <Button size="sm" onClick={pick} disabled={disabled}>
          Selecionar
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_110px_110px] gap-2.5">
        <Field label="Anime">
          <Input
            value={ep.anime}
            disabled={disabled}
            placeholder="Nome do anime"
            onChange={(e) => ep.set({ anime: e.target.value })}
            onBlur={async () => {
              // Ao digitar o nome na mão, recupera o OP/ED salvo desse anime.
              if (!ep.anime.trim()) return
              const r = await window.ancut.episode.skipRanges(ep.anime.trim())
              if (!r) return
              if (r.skipHeadSeconds || r.skipTailSeconds) {
                ep.set({
                  skipHead: mmss(r.skipHeadSeconds),
                  skipTail: mmss(r.skipTailSeconds)
                })
              }
            }}
          />
        </Field>
        <Field label="Temporada">
          <Input
            type="number"
            min={1}
            max={50}
            value={ep.season}
            disabled={disabled}
            onChange={(e) => ep.set({ season: Number(e.target.value) || 1 })}
          />
        </Field>
        <Field label="Episódio">
          <Input
            type="number"
            min={1}
            max={999}
            value={ep.episode}
            disabled={disabled}
            onChange={(e) => ep.set({ episode: Number(e.target.value) || 1 })}
          />
        </Field>
      </div>

      <Field label="Pasta de saída">
        <div className="flex gap-2">
          <Input
            value={ep.outputDir}
            disabled={disabled}
            onChange={(e) => ep.set({ outputDir: e.target.value })}
          />
          <Button size="md" onClick={pickOut} disabled={disabled} className="shrink-0 gap-1.5">
            <FolderOpen />
            Escolher
          </Button>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Ignorar abertura (OP)">
          <Input
            value={ep.skipHead}
            disabled={disabled}
            placeholder="01:30"
            onChange={(e) => ep.set({ skipHead: e.target.value })}
          />
        </Field>
        <Field label="Ignorar encerramento (ED)">
          <Input
            value={ep.skipTail}
            disabled={disabled}
            placeholder="01:30"
            onChange={(e) => ep.set({ skipTail: e.target.value })}
          />
        </Field>
      </div>
    </Panel>
  )
}

function mmss(seconds: number): string {
  if (!seconds || seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
