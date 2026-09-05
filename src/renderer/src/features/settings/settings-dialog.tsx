import { Eye, EyeOff, FolderOpen, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/field'
import { Panel } from '@/components/ui/panel'
import { UpdateCheckButton } from '@/features/update/update-check-button'
import { useEpisodeStore } from '@/stores/episode-store'
import type { AppInfo, AppSettings, RenderExportMode } from '@shared/types'

/**
 * Os dois níveis são separados de propósito: dá pra ligar só a compatibilidade
 * e medir, sem pagar o tamanho do all-intra. Se "compatível" já resolver o
 * gargalo do render, "seek rápido" fica desnecessário.
 */
const RENDER_MODES: {
  value: RenderExportMode
  label: string
  cost: string
  hint: string
}[] = [
  {
    value: 'off',
    label: 'Padrão',
    cost: '',
    hint: 'Mantém o formato de sempre. Bom pra assistir e editar à mão.'
  },
  {
    value: 'compat',
    label: 'Compatível com render',
    cost: '· mesmo tamanho',
    hint: '8 bits e 23,976 quadros por segundo fixos. Vídeo 10 bits não é decodificado por hardware, o que joga o render pra CPU. Na GPU esta opção não custa espaço nenhum.'
  },
  {
    value: 'intra',
    label: 'Compatível + seek rápido',
    cost: '· ~1,8x o tamanho',
    hint: 'Todo quadro vira ponto de entrada, então pular quadro a quadro fica barato. Só vale se o modo acima não tiver resolvido.'
  }
]

/**
 * Configurações. Grava no MESMO config.json do app Qt, então o que mudar
 * aqui vale nos dois enquanto a migração não termina.
 */
export function SettingsDialog({
  open,
  onOpenChange,
  info
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  info: AppInfo | null
}): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) void window.ancut.settings.get().then(setSettings)
  }, [open])

  const patch = (p: Partial<AppSettings>): void =>
    setSettings((s) => (s ? { ...s, ...p } : s))

  const save = async (): Promise<void> => {
    if (!settings) return
    setSaving(true)
    try {
      // Lista o que NÃO se persiste, e manda o resto. Ao contrário de listar o
      // que entra: assim um campo novo é gravado por padrão, em vez de sumir
      // calado no Salvar (foi exatamente o que aconteceu com o formato dos
      // clipes — a opção mudava na tela e nunca chegava ao disco).
      //
      // Os de fora pertencem à aba Analisar, não a esta janela: preset e
      // params saem do seletor de modo, o último episódio é gravado ao rodar
      // a análise, e skipCreditShots é heurística frágil que fica sempre OFF.
      const {
        preset: _preset,
        params: _params,
        skipCreditShots: _skip,
        lastAnime: _anime,
        lastSeason: _season,
        lastEpisode: _episode,
        ...persistiveis
      } = settings
      await window.ancut.settings.set(persistiveis)

      // O formulário da aba Analisar hidrata das configurações UMA vez, na
      // abertura do app. Sem reempurrar aqui, trocar o formato e analisar na
      // mesma sessão rodaria no valor antigo — a opção pareceria salva (e
      // está, no disco) mas a análise sairia no formato errado, calada.
      useEpisodeStore.getState().set({
        outputDir: settings.outputDir,
        useDanbooru: settings.useDanbooru,
        mediaKind: settings.mediaKind,
        renderExportMode: settings.renderExportMode
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Configurações"
        className="w-[min(660px,94vw)]"
        onClose={() => onOpenChange(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={!settings || saving} onClick={() => void save()}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              Salvar
            </Button>
          </>
        }
      >
        {!settings ? (
          <div className="grid h-32 place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-3 pr-1">
            <Panel title="Pasta de saída dos clipes" compact>
              <div className="flex gap-2">
                <Input
                  value={settings.outputDir}
                  onChange={(e) => patch({ outputDir: e.target.value })}
                />
                <Button
                  className="shrink-0 gap-1.5"
                  onClick={async () => {
                    const p = await window.ancut.dialog.pickFolder(settings.outputDir)
                    if (p) patch({ outputDir: p })
                  }}
                >
                  <FolderOpen />
                  Escolher
                </Button>
              </div>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                Subpastas por anime e episódio são criadas aqui dentro.
                Ex.: <code className="text-foreground/80">Dr. Stone/S04E25/shots/</code>
              </p>
            </Panel>

            <Panel title="AI principal (NavyAI)" compact>
              <Field label="API key">
                <SecretInput
                  value={settings.navyaiApiKey}
                  placeholder="sk-navy-..."
                  onChange={(v) => patch({ navyaiApiKey: v })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Modelo">
                  <Input
                    value={settings.navyaiModel}
                    onChange={(e) => patch({ navyaiModel: e.target.value })}
                  />
                </Field>
                <Field label="Endpoint">
                  <Input
                    value={settings.navyaiBaseUrl}
                    onChange={(e) => patch({ navyaiBaseUrl: e.target.value })}
                  />
                </Field>
              </div>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                Usada pelo botão <b>Analisar + IA</b>. Se falhar (quota,
                rate-limit, 5xx), cai automaticamente no Gemini abaixo.
              </p>
            </Panel>

            <Panel title="AI reserva (Gemini)" compact>
              <Field label="API key">
                <SecretInput
                  value={settings.geminiApiKey}
                  placeholder="AIza..."
                  onChange={(v) => patch({ geminiApiKey: v })}
                />
              </Field>
              <Field label="Modelo">
                <Input
                  value={settings.geminiModel}
                  onChange={(e) => patch({ geminiModel: e.target.value })}
                />
              </Field>
            </Panel>

            <Panel title="Live action (filme e série)" compact>
              <Field label="Chave do TMDB">
                <SecretInput
                  value={settings.tmdbApiKey}
                  placeholder="(gratuita em themoviedb.org)"
                  onChange={(v) => patch({ tmdbApiKey: v })}
                />
              </Field>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                O TMDB é o AniList do cinema: dá o elenco com a foto de cada
                ator, que vira a referência do reconhecimento. <b>Sem chave,
                live action ainda funciona pelo Modo Descoberta</b> — ele
                agrupa os rostos e você dá os nomes, sem depender de fonte
                nenhuma.
              </p>
            </Panel>

            <Panel title="Referências" compact>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={settings.useDanbooru}
                  onChange={(e) => patch({ useDanbooru: e.target.checked })}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span>
                  <span className="text-[13px]">
                    Usar Danbooru como fonte extra de referências
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
                    Tem mais imagens, mas muita fan art com vários personagens
                    juntos, o que contamina o reconhecimento. Ligue só se
                    souber que o anime tem tag boa.
                  </span>
                </span>
              </label>
            </Panel>

            <Panel title="Formato dos clipes" compact>
              <div className="space-y-1.5">
                {RENDER_MODES.map((m) => (
                  <label
                    key={m.value}
                    className="flex cursor-pointer items-start gap-2.5"
                  >
                    <input
                      type="radio"
                      name="render-export-mode"
                      checked={settings.renderExportMode === m.value}
                      onChange={() => patch({ renderExportMode: m.value })}
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                    />
                    <span>
                      <span className="text-[13px]">
                        {m.label}
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          {m.cost}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
                        {m.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
                Mudar o formato faz os clipes serem cortados de novo na próxima
                análise — os que já estão no disco estão no formato antigo.
              </p>
            </Panel>

            <div className="flex items-center justify-between px-1">
              <p className="text-[11.5px] text-muted-foreground">
                AnCut HUB v{info?.version ?? '—'}
                {info?.gpuName ? ` · ${info.gpuName}` : ' · CPU'}
              </p>
              <UpdateCheckButton />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Campo de chave: escondido por padrão, com botão de revelar. */
function SecretInput({
  value,
  placeholder,
  onChange
}: {
  value: string
  placeholder?: string
  onChange: (v: string) => void
}): JSX.Element {
  const [shown, setShown] = useState(false)
  return (
    <div className="flex gap-2">
      <Input
        type={shown ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <Button
        size="icon"
        className="shrink-0"
        onClick={() => setShown((v) => !v)}
        title={shown ? 'Esconder' : 'Mostrar'}
      >
        {shown ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  )
}
