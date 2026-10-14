import { q, q1 } from "./db";
import { enviarTexto } from "./whatsapp";
import { fmtKg, fmtPreco, parseNumeroBR, parseQuantidadeKg, semAcento, STATUS_EMOJI } from "./formato";
import {
  Usuario,
  Cotacao,
  usuarioPorTelefone,
  getCotacao,
  podeVer,
  resumo,
  criarCotacao,
  responderCotacao,
  fecharCotacao,
  perderCotacao,
  cancelarCotacao,
  listarCotacoes,
  destino,
} from "./servico";

export type Entrada = {
  de: string; // wa_id de quem enviou
  texto: string;
  waMsgId?: string;
  respostaA?: string; // id da mensagem citada (reply)
};

type Sessao = { etapa: string; dados: Record<string, any> };

const SESSAO_EXPIRA_MIN = 60;

async function lerSessao(tel: string): Promise<Sessao | null> {
  const s = await q1<{ etapa: string; dados: any; atualizado_em: string }>(
    `SELECT etapa, dados, atualizado_em FROM sessoes_bot WHERE telefone=$1`,
    [tel],
  );
  if (!s) return null;
  if (Date.now() - new Date(s.atualizado_em).getTime() > SESSAO_EXPIRA_MIN * 60_000) {
    await limparSessao(tel);
    return null;
  }
  return { etapa: s.etapa, dados: typeof s.dados === "string" ? JSON.parse(s.dados) : s.dados };
}

async function salvarSessao(tel: string, etapa: string, dados: Record<string, any>) {
  await q(
    `INSERT INTO sessoes_bot (telefone, etapa, dados, atualizado_em) VALUES ($1,$2,$3::jsonb,NOW())
     ON CONFLICT (telefone) DO UPDATE SET etapa=EXCLUDED.etapa, dados=EXCLUDED.dados, atualizado_em=NOW()`,
    [tel, etapa, JSON.stringify(dados)],
  );
}

async function limparSessao(tel: string) {
  await q(`DELETE FROM sessoes_bot WHERE telefone=$1`, [tel]);
}

function menu(u: Usuario): string {
  const base =
    `Olá, ${u.nome.split(" ")[0]}! 👋 *Cotações Ciclo*\n\n` +
    `*1* — Nova cotação\n` +
    `*2* — Minhas últimas cotações\n` +
    `*3* — Cotações em aberto\n\n` +
    `Atalhos:\n• *ver 12* — detalhes da cotação 12\n• *fechou 12* — pedido fechado\n• *perdeu 12 motivo* — cotação perdida\n• *cancelar 12* — cancelar cotação\n• *cancelar* — sai do passo a passo`;
  if (u.papel !== "ADMIN") return base;
  return (
    base +
    `\n\n*Admin:*\n• *pendentes* — aguardando preço\n• *preco 12 9,85 obs* — responder preço\n• Ou responda (citando) a mensagem da cotação só com o preço`
  );
}

function linhaLista(c: Cotacao, mostrarVendedor: boolean): string {
  const preco = c.preco_kg !== null ? ` · ${fmtPreco(c.preco_kg)}/kg` : "";
  const vend = mostrarVendedor ? ` · ${c.vendedor_nome.split(" ")[0]}` : "";
  return `${STATUS_EMOJI[c.status]} *#${c.id}* ${c.cliente} — ${c.produto} ${fmtKg(c.quantidade_kg)}${preco}${vend}`;
}

const ETAPAS: Record<string, { pergunta: string }> = {
  cliente: { pergunta: "🧾 *Nova cotação* (envie *cancelar* para sair)\n\n1/6 — Qual o *cliente*? (nome ou CNPJ)" },
  produto: { pergunta: "2/6 — Qual o *produto*? (ex: PEBDL LL118/21, PP H503)" },
  quantidade: { pergunta: "3/6 — Qual a *quantidade*? Em kg, ou use *t* para toneladas (ex: 25000 ou 25 t)" },
  frete: { pergunta: "4/6 — *Frete*?\n*1* — CIF\n*2* — FOB" },
  pagamento: { pergunta: "5/6 — *Condição de pagamento*? (ex: 28 dias, 28/56, à vista)" },
  obs: { pergunta: "6/6 — Alguma *observação*? (cidade de entrega, prazo, concorrente, preço-alvo…)\nEnvie *-* para pular." },
};

function confirmar(d: Record<string, any>): string {
  return (
    `Confira a cotação:\n\n` +
    `Cliente: ${d.cliente}\nProduto: ${d.produto}\nQuantidade: ${fmtKg(d.quantidadeKg)}\n` +
    `Frete: ${d.frete}\nPagamento: ${d.condicaoPagamento}\n` +
    (d.observacoes ? `Obs.: ${d.observacoes}\n` : "") +
    `\n*1* — Enviar para precificação\n*2* — Descartar`
  );
}

/** Processa uma mensagem recebida e responde pelo WhatsApp */
export async function processarMensagem(e: Entrada): Promise<void> {
  if (e.waMsgId) {
    const ja = await q1(`SELECT 1 FROM mensagens WHERE wa_msg_id=$1`, [e.waMsgId]);
    if (ja) return; // a Meta reenviou a mesma mensagem
  }

  const u = await usuarioPorTelefone(e.de);
  await q(`INSERT INTO mensagens (telefone, direcao, texto, wa_msg_id, usuario_id) VALUES ($1,'ENTRADA',$2,$3,$4)`, [
    e.de,
    e.texto,
    e.waMsgId ?? null,
    u?.id ?? null,
  ]);

  if (!u || !u.ativo) {
    await enviarTexto({
      para: e.de,
      texto: "Este número não está cadastrado no sistema de cotações da Ciclo. Fale com o administrador para liberar seu acesso.",
    });
    return;
  }
  if (u.wa_id !== e.de) await q(`UPDATE usuarios SET wa_id=$2 WHERE id=$1`, [u.id, e.de]);
  u.wa_id = e.de;

  const responder = (texto: string, cotacaoId: number | null = null) =>
    enviarTexto({ para: destino(u)!, texto, usuarioId: u.id, cotacaoId });

  const texto = e.texto.trim();
  const t = semAcento(texto);

  // 1) Passo a passo em andamento
  const sessao = await lerSessao(e.de);
  if (sessao) {
    if (t === "cancelar" || t === "sair" || t === "menu") {
      await limparSessao(e.de);
      await responder(t === "menu" ? menu(u) : "Ok, cotação descartada. Envie *menu* para ver as opções.");
      return;
    }
    await continuarFluxo(u, sessao, texto, t, responder);
    return;
  }

  // 2) Admin respondendo (citando) a mensagem de uma cotação
  if (u.papel === "ADMIN" && e.respostaA) {
    const ref = await q1<{ cotacao_id: number | null }>(`SELECT cotacao_id FROM mensagens WHERE wa_msg_id=$1`, [e.respostaA]);
    const m = texto.match(/^(?:r\$\s*)?([\d.,]+)(?:\s*\/?\s*kg)?\s*(.*)$/i);
    if (ref?.cotacao_id && m) {
      const preco = parseNumeroBR(m[1]);
      if (preco !== null) {
        const r = await responderCotacao(u, ref.cotacao_id, preco, m[2] || null);
        await responder(
          r.ok ? `✅ Preço de *${fmtPreco(preco)}/kg* enviado ao vendedor (cotação #${ref.cotacao_id}).` : `⚠️ ${r.erro}`,
          ref.cotacao_id,
        );
        return;
      }
    }
  }

  // 3) Comandos
  let m: RegExpMatchArray | null;

  if ((m = t.match(/^(?:preco|p)\s+#?(\d+)\s+(?:r\$\s*)?([\d.,]+)\s*(.*)$/))) {
    const preco = parseNumeroBR(m[2]);
    const obs = texto.match(/^\S+\s+#?\d+\s+(?:r\$\s*)?[\d.,]+\s*(.*)$/i)?.[1]?.trim() || null;
    if (preco === null) return void (await responder("Preço inválido. Exemplo: *preco 12 9,85*"));
    const r = await responderCotacao(u, Number(m[1]), preco, obs);
    await responder(r.ok ? `✅ Preço de *${fmtPreco(preco)}/kg* enviado (cotação #${m[1]}).` : `⚠️ ${r.erro}`, r.ok ? r.cot.id : null);
    return;
  }

  if ((m = t.match(/^(?:fechou|fechada|fechado|ganhou|ganha)\s+#?(\d+)$/))) {
    const r = await fecharCotacao(u, Number(m[1]));
    await responder(r.ok ? `✅ Boa! Cotação #${m[1]} registrada como *pedido fechado*.` : `⚠️ ${r.erro}`, r.ok ? r.cot.id : null);
    return;
  }

  if ((m = t.match(/^(?:perdeu|perdida|perdido|perda)\s+#?(\d+)\s*(.*)$/))) {
    const id = Number(m[1]);
    const motivo = texto.match(/^\S+\s+#?\d+\s*(.*)$/)?.[1]?.trim() ?? "";
    if (!motivo) {
      const c = await getCotacao(id);
      if (!c || !podeVer(u, c)) return void (await responder(`⚠️ Cotação #${id} não encontrada.`));
      await salvarSessao(e.de, "motivo_perda", { id });
      await responder(`Qual o *motivo* da perda da cotação #${id}? (ex: preço alto, prazo, cliente comprou de outro)`);
      return;
    }
    const r = await perderCotacao(u, id, motivo);
    await responder(r.ok ? `Registrado: cotação #${id} *perdida*. Motivo: ${motivo}` : `⚠️ ${r.erro}`, r.ok ? id : null);
    return;
  }

  if ((m = t.match(/^cancelar\s+#?(\d+)$/))) {
    const r = await cancelarCotacao(u, Number(m[1]));
    await responder(r.ok ? `🚫 Cotação #${m[1]} cancelada.` : `⚠️ ${r.erro}`, r.ok ? r.cot.id : null);
    return;
  }

  if ((m = t.match(/^(?:ver|detalhe|detalhes|#)\s*#?(\d+)$/)) || (m = t.match(/^#(\d+)$/))) {
    const c = await getCotacao(Number(m[1]));
    if (!c || !podeVer(u, c)) return void (await responder(`⚠️ Cotação #${m[1]} não encontrada.`));
    await responder(resumo(c), c.id);
    return;
  }

  if (["1", "nova", "nova cotacao", "cotacao", "cotar"].includes(t)) {
    await salvarSessao(e.de, "cliente", {});
    await responder(ETAPAS.cliente.pergunta);
    return;
  }

  if (["2", "minhas", "lista", "historico", "ultimas"].includes(t)) {
    const lista = await listarCotacoes(u, { limite: 10 });
    await responder(
      lista.length
        ? `📋 *Últimas cotações*\n\n${lista.map((c) => linhaLista(c, u.papel === "ADMIN")).join("\n")}\n\nEnvie *ver 12* para detalhes.`
        : "Nenhuma cotação ainda. Envie *1* para abrir a primeira.",
    );
    return;
  }

  if (["3", "abertas", "em aberto", "pendentes"].includes(t)) {
    const aguard = await listarCotacoes(u, { status: "AGUARDANDO_PRECO", limite: 20 });
    const resp = t === "pendentes" && u.papel === "ADMIN" ? [] : await listarCotacoes(u, { status: "RESPONDIDA", limite: 20 });
    const partes: string[] = [];
    if (aguard.length) partes.push(`⏳ *Aguardando preço*\n${aguard.map((c) => linhaLista(c, u.papel === "ADMIN")).join("\n")}`);
    if (resp.length) partes.push(`💰 *Respondidas, aguardando retorno do cliente*\n${resp.map((c) => linhaLista(c, u.papel === "ADMIN")).join("\n")}`);
    await responder(partes.length ? partes.join("\n\n") : "Nenhuma cotação em aberto. 👍");
    return;
  }

  await responder(menu(u));
}

async function continuarFluxo(
  u: Usuario,
  s: Sessao,
  texto: string,
  t: string,
  responder: (txt: string, cot?: number | null) => Promise<boolean>,
) {
  const d = s.dados;
  const tel = u.wa_id!;
  const ir = async (etapa: string) => {
    await salvarSessao(tel, etapa, d);
    await responder(etapa === "confirmar" ? confirmar(d) : ETAPAS[etapa].pergunta);
  };

  switch (s.etapa) {
    case "motivo_perda": {
      await limparSessao(tel);
      const r = await perderCotacao(u, d.id, texto);
      await responder(r.ok ? `Registrado: cotação #${d.id} *perdida*. Motivo: ${texto}` : `⚠️ ${r.erro}`, r.ok ? d.id : null);
      return;
    }
    case "cliente":
      if (texto.length < 2) return void (await responder("Informe o nome do cliente."));
      d.cliente = texto;
      return ir("produto");
    case "produto":
      if (texto.length < 2) return void (await responder("Informe o produto."));
      d.produto = texto;
      return ir("quantidade");
    case "quantidade": {
      const kg = parseQuantidadeKg(texto);
      if (kg === null) return void (await responder("Não entendi a quantidade. Exemplos: *25000*, *25.000 kg*, *25 t*"));
      d.quantidadeKg = kg;
      return ir("frete");
    }
    case "frete":
      if (t === "1" || t === "cif") d.frete = "CIF";
      else if (t === "2" || t === "fob") d.frete = "FOB";
      else return void (await responder("Responda *1* para CIF ou *2* para FOB."));
      return ir("pagamento");
    case "pagamento":
      d.condicaoPagamento = texto;
      return ir("obs");
    case "obs":
      d.observacoes = ["-", "nao", "n", "nenhuma", "sem"].includes(t) ? null : texto;
      return ir("confirmar");
    case "confirmar": {
      if (["2", "nao", "descartar"].includes(t)) {
        await limparSessao(tel);
        await responder("Ok, cotação descartada.");
        return;
      }
      if (!["1", "sim", "s", "ok", "enviar"].includes(t)) return void (await responder("Responda *1* para enviar ou *2* para descartar."));
      await limparSessao(tel);
      const r = await criarCotacao(
        u,
        {
          cliente: d.cliente,
          produto: d.produto,
          quantidadeKg: d.quantidadeKg,
          frete: d.frete,
          condicaoPagamento: d.condicaoPagamento,
          observacoes: d.observacoes,
        },
        "WHATSAPP",
      );
      if (r.ok)
        await responder(
          `📨 *Cotação #${r.cot.id} enviada para precificação!*\nVocê recebe o preço aqui assim que for liberado.\nPara acompanhar: *ver ${r.cot.id}*`,
          r.cot.id,
        );
      return;
    }
    default:
      await limparSessao(tel);
      await responder(menu(u));
  }
}
