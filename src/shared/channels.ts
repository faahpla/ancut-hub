/**
 * Nomes de canal IPC — valores de RUNTIME.
 *
 * Este arquivo NÃO pode importar nada. O preload importa daqui, e qualquer
 * dependência puxada junto (zod & cia) infla o bundle do preload — lição
 * paga no Dangai, onde o preload foi de 0,5 kB pra 132 kB.
 * Os tipos (que somem na compilação) moram em ./types.ts.
 */

export const CH = {
  /** Renderer → main: dispara uma análise. Devolve o runId. */
  analysisStart: 'analysis:start',
  /** Renderer → main: cancelamento cooperativo do run atual. */
  analysisCancel: 'analysis:cancel',
  /** Fecha o Modo Descoberta com os nomes dados pelo usuário. */
  commitDiscovery: 'analysis:commit-discovery',
  /** Main → renderer: stream de eventos do pipeline Python. */
  analysisEvent: 'analysis:event',

  /** Renderer → main: abre seletor de arquivo/pasta. */
  pickVideo: 'dialog:pick-video',
  pickFolder: 'dialog:pick-folder',

  /** Consultas leves ao backend (sem carregar o pipeline). */
  parseFilename: 'episode:parse-filename',
  skipRanges: 'episode:skip-ranges',
  hasAnalysis: 'episode:has-analysis',

  /** Resultados: episódios já analisados, personagens e cenas. */
  recentEpisodes: 'results:recent',
  loadResults: 'results:load',
  loadShots: 'results:shots',
  /** Junta várias cenas num clipe só, substituindo os pedaços em shots/. */
  mergeShots: 'results:merge',
  /** Apaga cenas de vez: clipe, hardlinks e keyframe. */
  deleteShots: 'results:delete',
  /** Reforça as refs do anime com os rostos deste episódio. */
  harvestStart: 'results:harvest',
  /** Main → renderer: progresso do reforço, um evento por personagem. */
  harvestEvent: 'results:harvest-event',
  /** Converte caminho do disco em URL media:// (e libera a raiz). */
  mediaUrls: 'results:media-urls',
  /** Congela este episódio como gabarito da régua de reconhecimento. */
  benchmarkAdd: 'results:benchmark-add',
  /** O que o usuário mexeu na pasta do episódio pelo Explorer. */
  explorerScan: 'results:explorer-scan',
  /** Aplica a faxina do Explorer como curadoria lembrada. */
  explorerApply: 'results:explorer-apply',
  /** Pastas de episódio na saída que o histórico não conhece. */
  orphanScan: 'results:orphans',
  /** Devolve uma pasta esquecida pro histórico, sem reanalisar. */
  orphanRestore: 'results:restore',
  /** Em que pasta de anime este nome cai, e quais pastas já existem. */
  animeFolder: 'episode:anime-folder',
  /** Simula juntar duas pastas de anime. Não move nada. */
  mergeAnimePlan: 'results:merge-anime-plan',
  /** Junta de verdade, depois de o usuário ver o plano. */
  mergeAnimeApply: 'results:merge-anime-apply',
  /** Simula mudar a temporada de episódios. Não renomeia nada. */
  setSeasonPlan: 'results:set-season-plan',
  /** Renomeia as pastas e reaponta o histórico. */
  setSeasonApply: 'results:set-season-apply',
  /** Personagens do acervo INTEIRO, com contagem de cenas. */
  characters: 'results:characters',
  /** Todas as cenas de um personagem, atravessando episódios. */
  characterShots: 'results:character-shots',
  /** O que seria apagado ao excluir um episódio. Não apaga nada. */
  deleteEpisodePlan: 'results:delete-episode-plan',
  /** Manda a pasta pra Lixeira do Windows e tira do histórico. */
  deleteEpisodeApply: 'results:delete-episode-apply',

  /** Renderer → main: lê/grava as configurações persistidas. */
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  /** Renderer → main: info de ambiente (versão, GPU, empacotado). */
  appInfo: 'app:info',

  /** Atualização automática pelo GitHub Releases. */
  updateStatus: 'update:status',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateApply: 'update:apply',
  /** Main → renderer: mudanças de fase e progresso do download. */
  updateEvent: 'update:event',

  /** Renderer → main: abre caminho no Explorer / player do sistema. */
  revealPath: 'shell:reveal',
  openPath: 'shell:open',
  /** Arrastar clipe pra fora do app (Explorer, editor, o que for). */
  startDrag: 'shell:start-drag',

  /** Controles da janela (ela é frameless — a barra de título é nossa). */
  winMinimize: 'win:minimize',
  winMaximizeToggle: 'win:maximize-toggle',
  winClose: 'win:close',
  winMaximizedChanged: 'win:maximized-changed'
} as const

export type ChannelName = (typeof CH)[keyof typeof CH]

/**
 * Etapas do pipeline, na ordem. Espelha `STAGES` em app/pipeline_types.py —
 * se mudar lá, muda aqui (o painel de progresso monta a checklist a partir
 * desta lista, e a telemetria de tempo vem chaveada por estes ids).
 */
export const STAGES = [
  { id: 'parse', label: 'Lendo arquivo' },
  { id: 'detect_shots', label: 'Detectando shots' },
  { id: 'cut_shots', label: 'Cortando clipes' },
  { id: 'fetch_characters', label: 'Buscando personagens' },
  { id: 'download_refs', label: 'Baixando referências' },
  { id: 'embed_refs', label: 'Gerando embeddings das referências' },
  { id: 'analyze_shots', label: 'Analisando shots' },
  { id: 'second_pass', label: 'Resgatando cenas parecidas' },
  { id: 'ai_review', label: 'Revisão IA dos duvidosos' },
  { id: 'organize', label: 'Organizando resultados' }
] as const

export type StageId = (typeof STAGES)[number]['id']
