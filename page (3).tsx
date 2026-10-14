import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario } from "../../../../lib/auth";
import { q } from "../../../../lib/db";
import { getCotacao, podeVer } from "../../../../lib/servico";
import { STATUS_LABEL, fmtData, fmtKg, fmtMoeda, fmtPreco } from "../../../../lib/formato";
import { acaoCotacao } from "../../../acoes";

export const dynamic = "force-dynamic";

type Item = { quando: string; tipo: "evento" | "msg"; titulo: string; texto?: string; entrada?: boolean };

export default async function Detalhe({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const u = await exigirUsuario();
  const { id } = await params;
  const { erro, ok } = await searchParams;
  const c = await getCotacao(Number(id));
  if (!c || !podeVer(u, c)) notFound();
  const admin = u.papel === "ADMIN";
  const aberta = c.status === "AGUARDANDO_PRECO" || c.status === "RESPONDIDA";

  const eventos = await q<{ criado_em: string; descricao: string; autor: string | null }>(
    `SELECT e.criado_em, e.descricao, us.nome AS autor FROM eventos e LEFT JOIN usuarios us ON us.id = e.autor_id
     WHERE e.cotacao_id=$1`,
    [c.id],
  );
  const msgs = await q<{ criado_em: string; texto: string; direcao: string; nome: string | null; telefone: string; usuario_id: number | null }>(
    `SELECT m.criado_em, m.texto, m.direcao, m.telefone, m.usuario_id, us.nome FROM mensagens m
     LEFT JOIN usuarios us ON us.id = m.usuario_id WHERE m.cotacao_id=$1`,
    [c.id],
  );

  const itens: Item[] = [
    ...eventos.map((e) => ({ quando: e.criado_em, tipo: "evento" as const, titulo: e.descricao })),
    ...msgs
      .filter((m) => admin || m.usuario_id === u.id)
      .map((m) => ({
        quando: m.criado_em,
        tipo: "msg" as const,
        titulo: `WhatsApp ${m.direcao === "SAIDA" ? "enviado para" : "recebido de"} ${m.nome ?? m.telefone}`,
        texto: m.texto,
        entrada: m.direcao === "ENTRADA",
      })),
  ].sort((a, b) => new Date(a.quando).getTime() - new Date(b.quando).getTime());

  return (
    <>
      <div className="linha-titulo">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/cotacoes">← Cotações</Link>
          </p>
          <h1>
            Cotação #{c.id} <span className={`selo s-${c.status}`}>{STATUS_LABEL[c.status]}</span>
          </h1>
        </div>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}
      {ok && <div className="aviso ok">Atualizado. Os envolvidos foram avisados no WhatsApp.</div>}

      <div className="detalhe">
        <div>
          <div className="cartao">
            <dl className="dados">
              <dt>Vendedor</dt>
              <dd>{c.vendedor_nome}</dd>
              <dt>Cliente</dt>
              <dd>{c.cliente}</dd>
              <dt>Produto</dt>
              <dd>{c.produto}</dd>
              <dt>Quantidade</dt>
              <dd>{fmtKg(c.quantidade_kg)}</dd>
              <dt>Frete</dt>
              <dd>{c.frete}</dd>
              <dt>Pagamento</dt>
              <dd>{c.condicao_pagamento}</dd>
              {c.observacoes && (
                <>
                  <dt>Observações</dt>
                  <dd>{c.observacoes}</dd>
                </>
              )}
              <dt>Aberta em</dt>
              <dd>
                {fmtData(c.criado_em)} · via {c.origem === "WHATSAPP" ? "WhatsApp" : "painel"}
              </dd>
            </dl>
          </div>

          {c.preco_kg !== null && (
            <div className="cartao">
              <h2>Preço</h2>
              <div className="preco-grande">{fmtPreco(c.preco_kg)}/kg</div>
              <p style={{ margin: "4px 0 0" }}>
                Total estimado: <strong>{fmtMoeda(c.preco_kg * c.quantidade_kg)}</strong>
              </p>
              {c.validade && <p className="muted">Validade: {c.validade}</p>}
              {c.resposta_obs && <p className="muted">Obs.: {c.resposta_obs}</p>}
              <p className="muted">Respondida em {fmtData(c.respondida_em)}</p>
            </div>
          )}

          {c.motivo_perda && (
            <div className="cartao">
              <h2>Motivo da perda</h2>
              <p style={{ margin: 0 }}>{c.motivo_perda}</p>
            </div>
          )}

          {aberta && (
            <div className="cartao acoes-cot">
              <h2>Ações</h2>
              {admin && (
                <form action={acaoCotacao}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="acao" value="responder" />
                  <label>
                    Preço R$/kg
                    <input name="preco" required inputMode="decimal" placeholder="9,85" defaultValue={c.preco_kg !== null ? fmtPreco(c.preco_kg).replace("R$ ", "") : undefined} />
                  </label>
                  <label>
                    Validade
                    <input name="validade" placeholder="ex: até 17/10" defaultValue={c.validade ?? undefined} />
                  </label>
                  <label style={{ flexBasis: "100%" }}>
                    Observação para o vendedor
                    <input name="obs" placeholder="opcional" />
                  </label>
                  <button className="btn verde" type="submit">
                    {c.status === "RESPONDIDA" ? "Revisar preço" : "Enviar preço ao vendedor"}
                  </button>
                </form>
              )}
              {c.status === "RESPONDIDA" && (
                <form action={acaoCotacao}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="acao" value="fechar" />
                  <button className="btn verde" type="submit">
                    ✓ Pedido fechado
                  </button>
                </form>
              )}
              <form action={acaoCotacao}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="acao" value="perder" />
                <label>
                  Motivo da perda
                  <input name="motivo" required placeholder="ex: preço alto, prazo, comprou de outro" />
                </label>
                <button className="btn vermelho" type="submit">
                  Marcar como perdida
                </button>
              </form>
              <form action={acaoCotacao}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="acao" value="cancelar" />
                <button className="btn claro peq" type="submit">
                  Cancelar cotação
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="cartao">
          <h2>Histórico</h2>
          <ul className="linha-tempo">
            {itens.map((i, k) => (
              <li key={k} className={i.tipo === "msg" ? "msg" : ""}>
                <div className="quando">{fmtData(i.quando)}</div>
                <div>{i.titulo}</div>
                {i.texto && <div className={`bolha ${i.entrada ? "entrada" : ""}`}>{i.texto.replace(/\*/g, "")}</div>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
