import logoUrl from '@/assets/logo-header.png'

/** Marca do cabeçalho: logo + wordmark com o "HUB" em verde. */
export function Brand(): JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <img src={logoUrl} alt="" className="h-[22px] w-auto" draggable={false} />
      <div className="leading-none">
        <div className="text-[15px] font-extrabold tracking-tight">
          AnCut <span className="text-primary">HUB</span>
        </div>
      </div>
    </div>
  )
}
