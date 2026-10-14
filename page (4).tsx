import Link from "next/link";
import { exigirUsuario } from "../../../lib/auth";
import { buscarCotacoes, indicadores, porVendedor, listarVendedores, Filtros } from "../../../lib/consultas";
import { STATUS_LABEL, fmtData, fmtKg, fmtMoeda, fmtNum, fmtPreco } from "../../../lib/formato";

export const dynamic = "force-dynamic";

export default async function Cotacoes({ searchParams }: { searchParams: Promise<Filtros> }) {
  const u = await exigirUsuario();
  const f = await searchParams;
  const admin = u.papel === "ADMIN";

  const [lista, ind, ranking, vendedores] = await Promise.all([
    buscarCotacoes(u, f),
    indicadores(u, f),
    admin ? porVendedor(u, f) : Promise.resolve([]),
    admin ? listarVendedores() : Promise.resolve([]),
  ]);

  const decididas = ind.fechadas + ind.perdidas;
  const conversao = decididas ? (ind.fechadas / decididas) * 100 : null;
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <div className="linha-titulo">
        <div>
          <h1>{admin ? "Cotações — todos os vendedores" : "Minhas cotações"}</h1>
          <p className="sub" style={{ margin: 0 }}>
            Histórico completo de cotações abertas pelo WhatsApp e pelo painel
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn claro" href={`/api/exportar${qs ? "?" + qs : ""}`}>
            Exportar Excel
          </a>
          <Link className="btn verde" href="/cotacoes/nova">
            + Nova cotação
          </Link>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi amarelo">
          <div className="rot">Aguardando preço</div>
          <div className="val">{ind.aguardando}</div>
          <div className="det">
            {ind.horas_resposta !== null ? `resposta média em ${fmtNum(ind.horas_resposta, 1)} h` : "—"}
          </div>
        </div>
        <div className="kpi">
          <div className="rot">Respondidas em aberto</div>
          <div className="val">{ind.respondidas}</div>
          <div className="det">aguardando retorno do cliente</div>
        </div>
        <div className="kpi verde">
          <div className="rot">Fechadas</div>
          <div className="val">{ind.fechadas}</div>
          <div className="det">
            {fmtKg(ind.kg_fechado)} · {fmtMoeda(ind.valor_fechado, 0)}
          </div>
        </div>
        <div className="kpi vermelho">
          <div className="rot">Perdidas</div>
          <div className="val">{ind.perdidas}</div>
          <div className="det">de {ind.total} cotações no período</div>
        </div>
        <div className="kpi">
          <div className="rot">Conversão</div>
          <div className="val">{conversao === null ? "—" : `${fmtNum(conversao, 0)}%`}</div>
          <div className="det">fechadas ÷ (fechadas + perdidas)</div>
        </div>
      </div>

      <div className="cartao">
        <form className="filtros">
          <label>
            Buscar
            <input name="busca" defaultValue={f.busca} placeholder="Cliente, produto ou nº" />
          </label>
          <label>
            Status
            <select name="status" defaultValue={f.status ?? ""}>
              <option value="">Todos</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {admin && (
            <label>
              Vendedor
              <select name="vendedor" defaultValue={f.vendedor ?? ""}>
                <option value="">Todos</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            De
            <input type="date" name="de" defaultValue={f.de} />
          </label>
          <label>
            Até
            <input type="date" name="ate" defaultValue={f.ate} />
          </label>
          <button className="btn" type="submit">
            Filtrar
          </button>
          {qs && (
            <Link className="btn claro" href="/cotacoes">
              Limpar
            </Link>
          )}
        </form>
      </div>

      {admin && ranking.length > 0 && (
        <div className="cartao">
          <h2>Por vendedor</h2>
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th className="num">Cotações</th>
                  <th className="num">Em aberto</th>
                  <th className="num">Fechadas</th>
                  <th className="num">Perdidas</th>
                  <th className="num">Conversão</th>
                  <th className="num">Volume fechado</th>
                  <th className="num">Valor fechado</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => {
                  const dec = r.fechadas + r.perdidas;
                  return (
                    <tr key={r.vendedor_id}>
                      <td>
                        <Link href={`/cotacoes?vendedor=${r.vendedor_id}`}>{r.nome}</Link>
                      </td>
                      <td className="num">{r.total}</td>
                      <td className="num">{r.abertas}</td>
                      <td className="num">{r.fechadas}</td>
                      <td className="num">{r.perdidas}</td>
                      <td className="num">{dec ? `${fmtNum((r.fechadas / dec) * 100, 0)}%` : "—"}</td>
                      <td className="num">{fmtKg(r.kg_fechado)}</td>
                      <td className="num">{fmtMoeda(r.valor_fechado, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="cartao">
        {lista.length === 0 ? (
          <div className="vazio">Nenhuma cotação encontrada.</div>
        ) : (
          <div className="tabela-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Data</th>
                  {admin && <th>Vendedor</th>}
                  <th>Cliente</th>
                  <th>Produto</th>
                  <th className="num">Qtd.</th>
                  <th>Frete</th>
                  <th className="num">Preço/kg</th>
                  <th className="num">Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/cotacoes/${c.id}`}>
                        <strong>#{c.id}</strong>
                      </Link>
                    </td>
                    <td className="muted">{fmtData(c.criado_em)}</td>
                    {admin && <td>{c.vendedor_nome}</td>}
                    <td>
                      <Link href={`/cotacoes/${c.id}`}>{c.cliente}</Link>
                    </td>
                    <td>{c.produto}</td>
                    <td className="num">{fmtKg(c.quantidade_kg)}</td>
                    <td>{c.frete}</td>
                    <td className="num">{c.preco_kg !== null ? fmtPreco(c.preco_kg) : "—"}</td>
                    <td className="num">{c.preco_kg !== null ? fmtMoeda(c.preco_kg * c.quantidade_kg, 0) : "—"}</td>
                    <td>
                      <span className={`selo s-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lista.length === 300 && <p className="muted">Mostrando as 300 mais recentes. Use os filtros ou exporte para ver todas.</p>}
      </div>
    </>
  );
}
