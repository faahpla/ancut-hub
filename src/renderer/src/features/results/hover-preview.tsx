import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ClipStrip } from '@shared/types'

/**
 * Espera antes de pedir a tira, em ms. Curta porque a tira é barata — só
 * existe pra não montar uma pra cada card que o mouse atravessa a caminho de
 * outro.
 */
const ATRASO = 120

const entre = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

/**
 * Tiras já prontas, por URL do clipe.
 *
 * Fora do componente porque o card desmonta (trocar de personagem, de aba,
 * de episódio) e volta: com ela aqui, quem já foi visto aparece na hora, sem
 * nem perguntar ao main — que de todo jeito responderia do disco.
 */
const prontas = new Map<string, ClipStrip>()

/**
 * Miniatura que o mouse PERCORRE: a posição na largura do card é a posição
 * no clipe — esquerda é o começo, direita é o fim.
 *
 * Isto já foi feito com um <video>, atribuindo `currentTime` a cada movimento,
 * e travava: "quando eu passo o mouse fica travado, tenho que tirar e voltar
 * pra funcionar". A causa é o arquivo, não o card — os clipes têm UM
 * quadro-chave só, no início, e cada salto pro meio decodifica tudo desde o
 * quadro zero. No primeiro hover, com o arquivo chegando, cada salto
 * cancelava o anterior antes de pintar. Ver `strip-service.ts`.
 *
 * Agora o main devolve uma TIRA — os quadros do clipe numa imagem só, montada
 * uma vez e guardada em disco — e mover o mouse é escolher qual pedaço dela
 * aparece. Custo zero por movimento, e funciona na primeira passada. É a
 * mesma solução do Dangai, que sofria com os mesmos clipes.
 *
 * Diferente da versão de vídeo, parar o mouse não toca a cena sozinha: o
 * mouse é a agulha, como no Dangai. Ver a cena correndo é o player ao lado.
 */
export function HoverPreview({
  thumb,
  clip,
  className
}: {
  thumb: string | null
  /** URL media:// do clipe. Sem ela o card continua sendo só a foto. */
  clip: string | null
  className?: string
}): JSX.Element {
  const [tira, setTira] = useState<ClipStrip | null>(() => (clip ? prontas.get(clip) ?? null : null))
  const [fracao, setFracao] = useState<number | null>(null)
  const timer = useRef<number | null>(null)
  const pedindo = useRef(false)

  // O card pode ser reaproveitado pra outro clipe (listas que reciclam
  // elementos): a tira é do clipe, não do card.
  useEffect(() => {
    setTira(clip ? prontas.get(clip) ?? null : null)
    pedindo.current = false
  }, [clip])

  const cancelar = (): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }

  // Desmontar com o timer armado (rolar a lista, trocar de personagem)
  // dispararia um `setState` num componente que já não existe.
  useEffect(() => cancelar, [])

  const apontar = (e: React.PointerEvent<HTMLDivElement>): void => {
    const r = e.currentTarget.getBoundingClientRect()
    setFracao(entre((e.clientX - r.left) / r.width, 0, 1))
  }

  const entrar = (e: React.PointerEvent<HTMLDivElement>): void => {
    apontar(e)
    if (!clip || tira || pedindo.current) return
    cancelar()
    const alvo = clip
    timer.current = window.setTimeout(() => {
      pedindo.current = true
      void window.ancut.results.clipStrip(alvo).then((r) => {
        if (!r) {
          // Sem tira o card continua com a miniatura: prévia a menos, nada
          // quebra. Fica liberado pra tentar de novo na próxima passada.
          pedindo.current = false
          return
        }
        // A imagem carrega ANTES de aparecer: trocar a miniatura por uma tira
        // que ainda não chegou piscaria o card em branco.
        const img = new Image()
        img.onload = () => {
          prontas.set(alvo, r)
          setTira(r)
        }
        img.onerror = () => {
          pedindo.current = false
        }
        img.src = r.url
      })
    }, ATRASO)
  }

  const sair = (): void => {
    cancelar()
    setFracao(null)
  }

  const dentro = fracao !== null
  const mostrando = dentro && tira !== null

  // Qual quadro da tira o mouse aponta, e onde ele está na imagem. Com o
  // fundo esticado pra `colunas × linhas` vezes o card, a posição em % de
  // cada célula é a coluna (ou linha) sobre o total menos um.
  let estilo: React.CSSProperties | undefined
  if (mostrando && tira) {
    const q = Math.min(tira.quadros - 1, Math.round((fracao ?? 0) * (tira.quadros - 1)))
    const col = q % tira.colunas
    const lin = Math.floor(q / tira.colunas)
    estilo = {
      backgroundImage: `url("${tira.url}")`,
      backgroundSize: `${tira.colunas * 100}% ${tira.linhas * 100}%`,
      backgroundPosition: `${tira.colunas > 1 ? (col / (tira.colunas - 1)) * 100 : 0}% ${
        tira.linhas > 1 ? (lin / (tira.linhas - 1)) * 100 : 0
      }%`
    }
  }

  return (
    <div
      className={cn('relative size-full overflow-hidden', className)}
      onPointerEnter={entrar}
      onPointerMove={apontar}
      onPointerLeave={sair}
    >
      {thumb ? (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          draggable={false}
          className={cn(
            'size-full object-cover transition-transform duration-200',
            !mostrando && 'group-hover:scale-[1.03]'
          )}
        />
      ) : (
        <div className="grid size-full place-items-center text-[11px] text-muted-foreground">
          sem keyframe
        </div>
      )}

      {/* A imagem de baixo NUNCA sai: a tira fica por cima. Trocar uma pela
          outra daria um pisca na entrada, que é onde o olho está. */}
      {mostrando && (
        <div className="pointer-events-none absolute inset-0 bg-no-repeat" style={estilo} />
      )}

      {/* A régua embaixo é a resposta do gesto: sem ela o mouse empurra a
          cena no escuro e não dá pra saber quanto sobrou de clipe. */}
      {mostrando && (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-black/45">
          <span
            className="block h-full bg-primary"
            style={{ width: `${entre(fracao ?? 0, 0, 1) * 100}%` }}
          />
        </span>
      )}
    </div>
  )
}
