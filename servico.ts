import { q, q1 } from "./db";
import { enviarTexto } from "./whatsapp";
import { fmtKg, fmtMoeda, fmtPreco, fmtData, STATUS_EMOJI, STATUS_LABEL, variantesTelefone } from "./formato";

export type Usuario = {
  id: number;
  nome: string;
  usuario: string;
  papel: "ADMIN" | "VENDEDOR";
  telefone: string | null;
  wa_id: string | null;
  ativo: boolean;
};

export type Cotacao = {
  id: number;
  vendedor_id: number;
  vendedor_nome: string;
  cliente: string;
  produto: string;
  quantidade_kg: number;
  frete: string;
  condicao_pagamento: string;
  observacoes: string | null;
  origem: string;
  status: string;
  preco_kg: number | null;
  validade: string | null;
  resposta_obs: string | null;
  motivo_perda: string | null;
  respondida_em: string | null;
  encerrada_em: string | null;
  criado_em: string;
};

export type Resultado = { ok: true; cot: Cotacao } | { ok: false; erro: string };

const COLS_USR = "id, nome, usuario, papel, telefone, wa_id, ativo";

export async function usuarioPorTelefone(tel: string): Promise<Usuario | null> {
  const v = variantesTelefone(tel);
  return q1<Usuario>(
    `SELECT ${COLS_USR} FROM usuarios WHERE telefone = ANY($1::text[]) OR wa_id = ANY($1::text[]) LIMIT 1`,
    [v],
  );
}

export async function usuarioPorId(id: number): Promise<Usuario | null> {
  return q1<Usuario>(`SELECT ${COLS_USR} FROM usuarios WHERE id = $1`, [id]);
}

async function adminsComTelefone(): Promise<Usuario[]> {
  return q<Usuario>(`SELECT ${COLS_USR} FROM usuarios WHERE papel = 'ADMIN' AND ativo AND telefone IS NOT NULL`);
}

export function destino(u: Usuario): string | null {
  return u.wa_id || u.telefone;
}

export async function getCotacao(id: number): Promise<Cotacao | null> {
  return q1<Cotacao>(
    `SELECT c.*, u.nome AS vendedor_nome FROM cotacoes c JOIN usuarios u ON u.id = c.vendedor_id WHERE c.id = $1`,
    [id],
  );
}

export function podeVer(u: Usuario, c: Cotacao): boolean {
  return u.papel === "ADMIN" || c.vendedor_id === u.id;
}

export async function registrarEvento(cotacaoId: number, autorId: number | null, tipo: string, descricao: string) {
  await q(`INSERT INTO eventos (cotacao_id, autor_id, tipo, descricao) VALUES ($1, $2, $3, $4)`, [
    cotacaoId,
    autorId,
    tipo,
    descricao,
  ]);
}

export function resumo(c: Cotacao, comPreco = true): string {
  const linhas = [
    `${STATUS_EMOJI[c.status] ?? ""} *Cotação #${c.id}* — ${STATUS_LABEL[c.status] ?? c.status}`,
    `Vendedor: ${c.vendedor_nome}`,
    `Cliente: ${c.cliente}`,
    `Produto: ${c.produto}`,
    `Quantidade: ${fmtKg(c.quantidade_kg)}`,
    `Frete: ${c.frete}`,
    `Pagamento: ${c.condicao_pagamento}`,
  ];
  if (c.observacoes) linhas.push(`Obs.: ${c.observacoes}`);
  if (comPreco && c.preco_kg !== null) {
    linhas.push(`Preço: *${fmtPreco(c.preco_kg)}/kg*`);
    linhas.push(`Total estimado: ${fmtMoeda(c.preco_kg * c.quantidade_kg)}`);
    if (c.validade) linhas.push(`Validade: ${c.validade}`);
    if (c.resposta_obs) linhas.push(`Obs. do preço: ${c.resposta_obs}`);
  }
  if (c.motivo_perda) linhas.push(`Motivo da perda: ${c.motivo_perda}`);
  linhas.push(`Aberta em: ${fmtData(c.criado_em)}`);
  return linhas.join("\n");
}

async function avisarAdmins(texto: string, cotacaoId: number, exceto?: number) {
  for (const a of await adminsComTelefone()) {
    if (a.id === exceto) continue;
    const para = destino(a);
    if (para) await enviarTexto({ para, texto, usuarioId: a.id, cotacaoId });
  }
}

async function avisarVendedor(c: Cotacao, texto: string, exceto?: number) {
  if (c.vendedor_id === exceto) return;
  const v = await usuarioPorId(c.vendedor_id);
  const para = v && v.ativo ? destino(v) : null;
  if (para) await enviarTexto({ para, texto, usuarioId: v!.id, cotacaoId: c.id });
}

export type DadosNova = {
  cliente: string;
  produto: string;
  quantidadeKg: number;
  frete: string;
  condicaoPagamento: string;
  observacoes?: string | null;
};

export async function criarCotacao(
  autor: Usuario,
  d: DadosNova,
  origem: "WHATSAPP" | "PAINEL",
  vendedorId?: number,
): Promise<Resultado> {
  const vend = autor.papel === "ADMIN" && vendedorId ? vendedorId : autor.id;
  const nova = await q1<{ id: number }>(
    `INSERT INTO cotacoes (vendedor_id, cliente, produto, quantidade_kg, frete, condicao_pagamento, observacoes, origem)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [vend, d.cliente.trim(), d.produto.trim(), d.quantidadeKg, d.frete, d.condicaoPagamento.trim(), d.observacoes?.trim() || null, origem],
  );
  const c = (await getCotacao(nova!.id))!;
  await registrarEvento(c.id, autor.id, "CRIADA", `Cotação aberta por ${autor.nome} via ${origem === "WHATSAPP" ? "WhatsApp" : "painel"}`);
  await avisarAdmins(
    `🆕 *Nova cotação para precificar*\n\n${resumo(c, false)}\n\n` +
      `👉 *Responda esta mensagem só com o preço por kg* (ex: 9,85)\n` +
      `ou envie: *preco ${c.id} 9,85 observação opcional*`,
    c.id,
    autor.id,
  );
  return { ok: true, cot: c };
}

export async function responderCotacao(
  autor: Usuario,
  id: number,
  precoKg: number,
  obs?: string | null,
  validade?: string | null,
): Promise<Resultado> {
  if (autor.papel !== "ADMIN") return { ok: false, erro: "Só o administrador pode informar preço." };
  const c = await getCotacao(id);
  if (!c) return { ok: false, erro: `Cotação #${id} não encontrada.` };
  if (!["AGUARDANDO_PRECO", "RESPONDIDA"].includes(c.status))
    return { ok: false, erro: `Cotação #${id} já está ${STATUS_LABEL[c.status].toLowerCase()}.` };
  if (!(precoKg > 0)) return { ok: false, erro: "Preço inválido." };
  const revisao = c.status === "RESPONDIDA";
  await q(
    `UPDATE cotacoes SET status='RESPONDIDA', preco_kg=$2, resposta_obs=$3, validade=COALESCE($4, validade),
     respondida_em=NOW(), atualizado_em=NOW() WHERE id=$1`,
    [id, precoKg, obs?.trim() || null, validade?.trim() || null],
  );
  const nova = (await getCotacao(id))!;
  await registrarEvento(
    id,
    autor.id,
    revisao ? "PRECO_REVISADO" : "RESPONDIDA",
    `${revisao ? "Preço revisado" : "Preço informado"}: ${fmtPreco(precoKg)}/kg` +
      (revisao && c.preco_kg !== null ? ` (antes ${fmtPreco(c.preco_kg)}/kg)` : "") +
      (obs ? ` — ${obs}` : ""),
  );
  await avisarVendedor(
    nova,
    `💰 *${revisao ? "Preço revisado" : "Preço liberado"}!*\n\n${resumo(nova)}\n\n` +
      `Quando tiver o retorno do cliente, envie:\n• *fechou ${id}*\n• *perdeu ${id} motivo* (ex: perdeu ${id} preço alto)`,
    autor.id,
  );
  return { ok: true, cot: nova };
}

export async function fecharCotacao(autor: Usuario, id: number): Promise<Resultado> {
  const c = await getCotacao(id);
  if (!c || !podeVer(autor, c)) return { ok: false, erro: `Cotação #${id} não encontrada.` };
  if (c.status !== "RESPONDIDA")
    return { ok: false, erro: `Só dá para fechar cotação já respondida. #${id} está: ${STATUS_LABEL[c.status]}.` };
  await q(`UPDATE cotacoes SET status='FECHADA', encerrada_em=NOW(), atualizado_em=NOW() WHERE id=$1`, [id]);
  const nova = (await getCotacao(id))!;
  await registrarEvento(id, autor.id, "FECHADA", `Pedido fechado (informado por ${autor.nome})`);
  await avisarAdmins(`✅ *Pedido fechado!*\n\n${resumo(nova)}`, id, autor.id);
  await avisarVendedor(nova, `✅ Cotação #${id} marcada como *fechada* por ${autor.nome}.`, autor.id);
  return { ok: true, cot: nova };
}

export async function perderCotacao(autor: Usuario, id: number, motivo: string): Promise<Resultado> {
  const c = await getCotacao(id);
  if (!c || !podeVer(autor, c)) return { ok: false, erro: `Cotação #${id} não encontrada.` };
  if (!["AGUARDANDO_PRECO", "RESPONDIDA"].includes(c.status))
    return { ok: false, erro: `Cotação #${id} já está ${STATUS_LABEL[c.status].toLowerCase()}.` };
  if (!motivo.trim()) return { ok: false, erro: "Informe o motivo da perda." };
  await q(`UPDATE cotacoes SET status='PERDIDA', motivo_perda=$2, encerrada_em=NOW(), atualizado_em=NOW() WHERE id=$1`, [
    id,
    motivo.trim(),
  ]);
  const nova = (await getCotacao(id))!;
  await registrarEvento(id, autor.id, "PERDIDA", `Cotação perdida — motivo: ${motivo.trim()}`);
  await avisarAdmins(`❌ *Cotação perdida*\n\n${resumo(nova)}`, id, autor.id);
  await avisarVendedor(nova, `❌ Cotação #${id} marcada como *perdida* por ${autor.nome}. Motivo: ${motivo.trim()}`, autor.id);
  return { ok: true, cot: nova };
}

export async function cancelarCotacao(autor: Usuario, id: number): Promise<Resultado> {
  const c = await getCotacao(id);
  if (!c || !podeVer(autor, c)) return { ok: false, erro: `Cotação #${id} não encontrada.` };
  if (!["AGUARDANDO_PRECO", "RESPONDIDA"].includes(c.status))
    return { ok: false, erro: `Cotação #${id} já está ${STATUS_LABEL[c.status].toLowerCase()}.` };
  await q(`UPDATE cotacoes SET status='CANCELADA', encerrada_em=NOW(), atualizado_em=NOW() WHERE id=$1`, [id]);
  const nova = (await getCotacao(id))!;
  await registrarEvento(id, autor.id, "CANCELADA", `Cotação cancelada por ${autor.nome}`);
  await avisarAdmins(`🚫 Cotação #${id} (${c.cliente}) foi cancelada por ${autor.nome}.`, id, autor.id);
  await avisarVendedor(nova, `🚫 Cotação #${id} (${c.cliente}) foi cancelada por ${autor.nome}.`, autor.id);
  return { ok: true, cot: nova };
}

export async function listarCotacoes(u: Usuario, opts: { status?: string; limite?: number } = {}): Promise<Cotacao[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (u.papel !== "ADMIN") {
    params.push(u.id);
    conds.push(`c.vendedor_id = $${params.length}`);
  }
  if (opts.status) {
    params.push(opts.status);
    conds.push(`c.status = $${params.length}`);
  }
  params.push(opts.limite ?? 10);
  return q<Cotacao>(
    `SELECT c.*, u.nome AS vendedor_nome FROM cotacoes c JOIN usuarios u ON u.id = c.vendedor_id
     ${conds.length ? "WHERE " + conds.join(" AND ") : ""} ORDER BY c.id DESC LIMIT $${params.length}`,
    params,
  );
}
