/**
 * Cache stale-while-revalidate (papel do @tanstack/react-query no Projeto WR).
 *
 * Mantem o ultimo resultado por chave (ex.: mes). Ao reabrir uma tela:
 *  - se ha cache fresco (< staleMs), mostra na hora e NAO bate na rede;
 *  - se ha cache velho, mostra na hora e revalida em background (sem spinner);
 *  - se nao ha cache, mostra spinner e busca.
 *
 * Toda instancia se registra para que mutacoes possam limpar tudo de uma vez
 * (ver invalidateAllCaches) — simples e correto: escritas sao raras e os dados pequenos.
 */
const registry: SwrCache<unknown>[] = [];
const invalidationListeners: (() => void)[] = [];

/** Registra um callback executado a cada invalidateAllCaches (ex.: BundleService zera seu controle). */
export function onInvalidateAll(fn: () => void): void {
  invalidationListeners.push(fn);
}

export class SwrCache<T> {
  private store = new Map<string, { value: T; at: number }>();

  constructor(
    private fetcher: (key: string) => Promise<T>,
    private staleMs = 30_000,
  ) {
    registry.push(this as SwrCache<unknown>);
  }

  peek(key: string): T | undefined {
    return this.store.get(key)?.value;
  }

  isFresh(key: string): boolean {
    const e = this.store.get(key);
    return !!e && Date.now() - e.at < this.staleMs;
  }

  async refresh(key: string): Promise<T> {
    const value = await this.fetcher(key);
    this.store.set(key, { value, at: Date.now() });
    return value;
  }

  // Popula o cache sem ir à rede (usado pela pré-carga em lote do BundleService).
  hydrate(key: string, value: T): void {
    this.store.set(key, { value, at: Date.now() });
  }

  invalidate(key?: string): void {
    if (key === undefined) this.store.clear();
    else this.store.delete(key);
  }

  // Marca tudo como velho SEM apagar: a tela continua mostrando o dado anterior
  // na hora (sem spinner) e o swrLoad revalida em background. Evita o "trava tudo"
  // que o clear causava (todas as telas voltavam pro esqueleto e rebuscavam).
  markStale(): void {
    for (const e of this.store.values()) e.at = 0;
  }
}

/**
 * Invalida todos os caches apos uma escrita. Suave: os dados antigos continuam
 * visiveis e cada tela revalida em background ao ser exibida (stale-while-revalidate
 * de verdade, sem spinner nem refetch em bloco).
 */
export function invalidateAllCaches(): void {
  for (const c of registry) c.markStale();
  for (const fn of invalidationListeners) fn();
}

/**
 * Carga padrao SWR para usar nas telas:
 *  set/loading sao os setters dos signals da pagina.
 * Retorna sem tocar na rede quando o cache esta fresco.
 */
export async function swrLoad<T>(
  cache: SwrCache<T>,
  key: string,
  set: (v: T) => void,
  loading: (b: boolean) => void,
  // markForCheck da pagina: necessario porque a RouteReuseStrategy reanexa a view e,
  // apos o reattach, set() de signal nao dispara mais o markForCheck automatico do OnPush.
  mark?: () => void,
): Promise<void> {
  const m = () => mark?.();
  const cached = cache.peek(key);
  if (cached !== undefined) {
    set(cached);
    loading(false);
    m();
    if (cache.isFresh(key)) return; // fresco -> zero rede
  } else {
    loading(true);
    m();
  }
  try {
    set(await cache.refresh(key));
  } catch {
    /* mantem o cache/estado anterior em caso de falha de rede */
  } finally {
    loading(false);
    m();
  }
}
