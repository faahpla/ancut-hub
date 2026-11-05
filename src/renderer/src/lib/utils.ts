import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { EpisodeKind } from '@shared/types'

/**
 * O título do vídeo sem o nome do anime na frente.
 *
 * "Cyberpunk 2077 — Trailer de Lançamento Oficial — V" dentro da pasta
 * Cyberpunk 2077 vira "Trailer de Lançamento Oficial — V": repetir o nome
 * em todo B-roll só empurra o que importa pra fora da tela. Mesma regra de
 * `titulo_do_arquivo` no motor.
 */
export function tituloSemAnime(titulo: string, anime: string): string {
  const t = titulo.trim()
  const a = anime.trim()
  if (!a || !t.toLowerCase().startsWith(a.toLowerCase())) return t
  const resto = t.slice(a.length).replace(/^[\s\-–—:|·]+/, '').trim()
  return resto || t
}

/** Junta classes condicionais resolvendo conflitos do Tailwind. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Duração legível: "2.0s" abaixo de um minuto, "1:23" acima.
 *
 * Abaixo de 60s o relógio mente por arredondamento — "0:02" some com a
 * diferença entre 1,6s e 2,4s, justo na faixa onde comparar etapas importa.
 */
export function formatDuration(seconds: number): string {
  return seconds < 60 ? `${seconds.toFixed(1)}s` : formatClock(seconds)
}

/** Segundos → "1:23" ou "1:02:03". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

/**
 * Nome da PASTA do episódio no disco: "S02E01", "S02-OP1", "S02-ED2".
 *
 * Espelha `EpisodeInfo.slug` do motor. Diferente do rótulo de tela abaixo:
 * este vai virar caminho, então nada de ponto do meio nem espaço.
 */
export function episodeSlug(
  season: number,
  episode: number,
  kind: EpisodeKind,
  titulo = ''
): string {
  // Tem que casar com `EpisodeInfo.slug` no motor — é o nome da pasta no
  // disco, e esta função é a prévia dele no formulário.
  if (kind === 'MOVIE') return episode > 1900 ? `Filme (${episode})` : 'Filme'
  if (kind === 'BROLL') {
    // Número 0 = novo: quem escolhe o número livre é o motor, na hora.
    const n = episode > 0 ? ` ${String(episode).padStart(2, '0')}` : ''
    return titulo.trim() ? `B-roll${n} - ${titulo.trim()}` : `B-roll${n}`
  }
  const s = `S${String(season).padStart(2, '0')}`
  if (kind) return `${s}-${kind}${episode}`
  return `${s}E${String(episode).padStart(2, '0')}`
}

/**
 * Rótulo curto do episódio: "S02E01", "S02 · OP1", "S02 · ED2".
 *
 * Um lugar só, usado pelo cabeçalho dos resultados e pelo histórico. Duas
 * cópias divergiriam na primeira vez que alguém mudasse o formato num só.
 */
export function episodeLabel(
  season: number,
  episode: number,
  kind: EpisodeKind,
  titulo = ''
): string {
  // B-roll se chama pelo nome do vídeo; o número só ordena.
  if (kind === 'BROLL') return titulo.trim() || `B-roll ${episode}`
  // Filme não tem temporada nem episódio — mostrar "S01E01" nele seria
  // inventar uma numeração. O ano ocupa a vaga do episódio (ver
  // `EpisodeInfo.slug` no motor) e é ele que distingue um John Wick do outro.
  if (kind === 'MOVIE') return episode > 1900 ? `Filme · ${episode}` : 'Filme'
  const s = `S${String(season).padStart(2, '0')}`
  if (kind) return `${s} · ${kind}${episode}`
  return `${s}E${String(episode).padStart(2, '0')}`
}
