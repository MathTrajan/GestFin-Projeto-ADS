'use strict';
/**
 * Cliente HTTP para os testes de integração.
 *
 * O fetch nativo não guarda cookies entre requisições, e o sistema depende
 * justamente deles para manter a sessão. Este cliente mínimo faz esse papel, sem
 * acrescentar dependência ao projeto.
 */

class Cliente {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  /** Guarda os cookies devolvidos pelo servidor. */
  guardarCookies(resposta) {
    const cabecalhos = resposta.headers.getSetCookie
      ? resposta.headers.getSetCookie()
      : [resposta.headers.get('set-cookie')].filter(Boolean);

    for (const bruto of cabecalhos) {
      const [par] = bruto.split(';');
      const separador = par.indexOf('=');
      const nome = par.slice(0, separador).trim();
      const valor = par.slice(separador + 1).trim();
      if (valor === '') this.cookies.delete(nome);
      else this.cookies.set(nome, valor);
    }
  }

  cabecalhoDeCookies() {
    return [...this.cookies.entries()].map(([n, v]) => `${n}=${v}`).join('; ');
  }

  async requisitar(metodo, caminho, corpo) {
    const cabecalhos = {};
    if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    if (this.cookies.size > 0) cabecalhos.Cookie = this.cabecalhoDeCookies();

    const resposta = await fetch(`${this.baseUrl}${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });

    this.guardarCookies(resposta);

    const texto = await resposta.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = texto;
    }

    return { status: resposta.status, dados, headers: resposta.headers };
  }

  get = (caminho) => this.requisitar('GET', caminho);
  post = (caminho, corpo) => this.requisitar('POST', caminho, corpo ?? {});
  patch = (caminho, corpo) => this.requisitar('PATCH', caminho, corpo ?? {});
  delete = (caminho) => this.requisitar('DELETE', caminho);

  /** Cria um cliente novo, sem sessão, apontando para o mesmo servidor. */
  anonimo() {
    return new Cliente(this.baseUrl);
  }
}

module.exports = { Cliente };
