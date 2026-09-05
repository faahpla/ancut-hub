import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type {
  AppSettings,
  MatchParams,
  PresetKey,
  RenderExportMode
} from '../../shared/types'

/**
 * As configurações moram no MESMO config.json que o app Qt usa
 * (%LOCALAPPDATA%\CorteCenas\CorteCenas\config.json), em vez de num
 * electron-store separado.
 *
 * Motivo: durante a migração os dois apps convivem. Se o usuário mudar a
 * pasta de saída num, o outro tem que enxergar. Duas fontes de verdade
 * viraria bug garantido — e as chaves de API teriam que ser digitadas duas
 * vezes.
 *
 * O formato é o do Python (snake_case); a tradução pro camelCase da interface
 * acontece aqui e em nenhum outro lugar.
 */

const CONFIG_PATH = join(
  process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'),
  'CorteCenas',
  'CorteCenas',
  'config.json'
)

/** Espelha os defaults de app/config.py. */
const DEFAULT_PARAMS: MatchParams = {
  threshold: 0.8,
  margin: 0.03,
  minShots: 3,
  padding: 0.25,
  credit: 0.55
}

const PRESETS: Record<PresetKey, MatchParams> = {
  strict: { threshold: 0.86, margin: 0.05, minShots: 8, padding: 0.25, credit: 0.5 },
  auto: { threshold: 0.8, margin: 0.03, minShots: 3, padding: 0.25, credit: 0.55 },
  loose: { threshold: 0.74, margin: 0.02, minShots: 2, padding: 0.3, credit: 0.7 }
}

/** Descobre qual preset bate com os valores atuais (senão, 'auto'). */
export function presetFor(p: MatchParams): PresetKey {
  const eq = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6
  for (const [key, ref] of Object.entries(PRESETS) as [PresetKey, MatchParams][]) {
    if (
      eq(p.threshold, ref.threshold) &&
      eq(p.margin, ref.margin) &&
      p.minShots === ref.minShots &&
      eq(p.padding, ref.padding) &&
      eq(p.credit, ref.credit)
    ) {
      return key
    }
  }
  return 'auto'
}

export function paramsForPreset(key: PresetKey): MatchParams {
  return { ...PRESETS[key] }
}

type RawConfig = Record<string, unknown>

function str(raw: RawConfig, key: string, fallback = ''): string {
  const v = raw[key]
  return typeof v === 'string' ? v : fallback
}
function num(raw: RawConfig, key: string, fallback: number): number {
  const v = raw[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function bool(raw: RawConfig, key: string, fallback: boolean): boolean {
  const v = raw[key]
  return typeof v === 'boolean' ? v : fallback
}

function toSettings(raw: RawConfig): AppSettings {
  const params: MatchParams = {
    threshold: num(raw, 'default_threshold', DEFAULT_PARAMS.threshold),
    margin: num(raw, 'argmax_margin', DEFAULT_PARAMS.margin),
    minShots: num(raw, 'min_shots_per_character', DEFAULT_PARAMS.minShots),
    padding: num(raw, 'face_crop_padding', DEFAULT_PARAMS.padding),
    credit: num(raw, 'credit_edge_threshold', DEFAULT_PARAMS.credit)
  }
  return {
    outputDir: str(raw, 'output_dir'),
    lastAnime: str(raw, 'last_anime'),
    lastSeason: num(raw, 'last_season', 1),
    lastEpisode: num(raw, 'last_episode', 1),
    preset: presetFor(params),
    params,
    // Não é persistido no Python de propósito (heurística frágil, fica OFF).
    skipCreditShots: false,
    useDanbooru: bool(raw, 'use_danbooru', false),
    mediaKind: str(raw, 'media_kind', 'anime') === 'live' ? 'live' : 'anime',
    tmdbApiKey: str(raw, 'tmdb_api_key'),
    renderExportMode: modeFor(str(raw, 'render_export_mode', 'off')),
    navyaiApiKey: str(raw, 'navyai_api_key'),
    navyaiModel: str(raw, 'navyai_model', 'gemini-2.5-flash'),
    navyaiBaseUrl: str(raw, 'navyai_base_url', 'https://api.navy/v1'),
    geminiApiKey: str(raw, 'gemini_api_key'),
    geminiModel: str(raw, 'gemini_model', 'gemini-2.5-flash')
  }
}

/** Modo desconhecido no config.json vira "off": formato de saída não pode
 *  mudar por causa de um valor digitado errado no arquivo. */
function modeFor(value: string): RenderExportMode {
  return value === 'compat' || value === 'intra' ? value : 'off'
}

/** Aplica o patch por cima do JSON cru, preservando chaves desconhecidas. */
function applyPatch(raw: RawConfig, patch: Partial<AppSettings>): RawConfig {
  const out = { ...raw }
  const set = <T,>(key: string, value: T | undefined): void => {
    if (value !== undefined) out[key] = value
  }
  set('output_dir', patch.outputDir)
  set('last_anime', patch.lastAnime)
  set('last_season', patch.lastSeason)
  set('last_episode', patch.lastEpisode)
  set('use_danbooru', patch.useDanbooru)
  set('media_kind', patch.mediaKind)
  set('tmdb_api_key', patch.tmdbApiKey)
  set('render_export_mode', patch.renderExportMode)
  set('navyai_api_key', patch.navyaiApiKey)
  set('navyai_model', patch.navyaiModel)
  set('navyai_base_url', patch.navyaiBaseUrl)
  set('gemini_api_key', patch.geminiApiKey)
  set('gemini_model', patch.geminiModel)
  if (patch.params) {
    out['default_threshold'] = patch.params.threshold
    out['argmax_margin'] = patch.params.margin
    out['min_shots_per_character'] = patch.params.minShots
    out['face_crop_padding'] = patch.params.padding
    out['credit_edge_threshold'] = patch.params.credit
  }
  return out
}

export class SettingsStore {
  private async readRaw(): Promise<RawConfig> {
    try {
      const text = await fs.readFile(CONFIG_PATH, 'utf-8')
      const parsed: unknown = JSON.parse(text)
      return typeof parsed === 'object' && parsed !== null ? (parsed as RawConfig) : {}
    } catch {
      // Arquivo ausente ou corrompido: cai nos defaults em vez de quebrar.
      return {}
    }
  }

  async get(): Promise<AppSettings> {
    return toSettings(await this.readRaw())
  }

  async set(patch: Partial<AppSettings>): Promise<AppSettings> {
    const raw = await this.readRaw()
    const merged = applyPatch(raw, patch)
    await fs.mkdir(dirname(CONFIG_PATH), { recursive: true })
    await fs.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8')
    return toSettings(merged)
  }
}
