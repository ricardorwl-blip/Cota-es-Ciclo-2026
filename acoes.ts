"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { q, q1 } from "../lib/db";
import { criarSessao, encerrarSessao, exigirAdmin, exigirUsuario } from "../lib/auth";
import { normalizarTelefone, parseNumeroBR, parseQuantidadeKg } from "../lib/formato";
import {
  Usuario,
  criarCotacao,
  responderCotacao,
  fecharCotacao,
  perderCotacao,
  cancelarCotacao,
} from "../lib/servico";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const comErro = (caminho: string, erro: string) =>
  redirect(`${caminho}${caminho.includes("?") ? "&" : "?"}erro=${encodeURIComponent(erro)}`);

// ---------- Login ----------

export async function entrar(f: FormData) {
  const usuario = txt(f, "usuario").toLowerCase();
  const senha = txt(f, "senha");
  const u = await q1<Usuario & { senha_hash: string }>(
    `SELECT id, nome, usuario, papel, telefone, wa_id, ativo, senha_hash FROM usuarios WHERE lower(usuario)=$1`,
    [usuario],
  );
  if (!u || !u.ativo || !(await bcrypt.compare(senha, u.senha_hash))) comErro("/login", "Usuário ou senha incorretos");
  await criarSessao(u!);
  redirect("/cotacoes");
}

export async function sair() {
  await encerrarSessao();
  redirect("/login");
}

export async function configurarAdmin(f: FormData) {
  const [{ n }] = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM usuarios`);
  if (n > 0) redirect("/login");
  const nome = txt(f, "nome");
  const usuario = txt(f, "usuario").toLowerCase();
  const senha = txt(f, "senha");
  const telefone = normalizarTelefone(txt(f, "telefone")) || null;
  if (!nome || !usuario || senha.length < 6) comErro("/setup", "Preencha nome, usuário e senha (mínimo 6 caracteres)");
  const u = await q1<Usuario>(
    `INSERT INTO usuarios (nome, usuario, senha_hash, papel, telefone) VALUES ($1,$2,$3,'ADMIN',$4)
     RETURNING id, nome, usuario, papel, telefone, wa_id, ativo`,
    [nome, usuario, await bcrypt.hash(senha, 10), telefone],
  );
  await criarSessao(u!);
  redirect("/vendedores");
}

// ---------- Cotações ----------

export async function novaCotacao(f: FormData) {
  const u = await exigirUsuario();
  const kg = parseQuantidadeKg(txt(f, "quantidade"));
  const dados = {
    cliente: txt(f, "cliente"),
    produto: txt(f, "produto"),
    quantidadeKg: kg ?? 0,
    frete: txt(f, "frete") === "FOB" ? "FOB" : "CIF",
    condicaoPagamento: txt(f, "pagamento"),
    observacoes: txt(f, "observacoes") || null,
  };
  if (!dados.cliente || !dados.produto || !dados.condicaoPagamento) comErro("/cotacoes/nova", "Preencha cliente, produto e pagamento");
  if (!kg) comErro("/cotacoes/nova", "Quantidade inválida. Use kg ou t (ex: 25000 ou 25 t)");
  const vendedorId = Number(txt(f, "vendedor_id")) || undefined;
  const r = await criarCotacao(u, dados, "PAINEL", vendedorId);
  if (!r.ok) comErro("/cotacoes/nova", r.erro);
  revalidatePath("/cotacoes");
  redirect(`/cotacoes/${r.ok ? r.cot.id : ""}`);
}

export async function acaoCotacao(f: FormData) {
  const u = await exigirUsuario();
  const id = Number(txt(f, "id"));
  const acao = txt(f, "acao");
  const caminho = `/cotacoes/${id}`;
  let r;
  if (acao === "responder") {
    const preco = parseNumeroBR(txt(f, "preco"));
    if (preco === null) comErro(caminho, "Preço inválido");
    r = await responderCotacao(u, id, preco!, txt(f, "obs") || null, txt(f, "validade") || null);
  } else if (acao === "fechar") r = await fecharCotacao(u, id);
  else if (acao === "perder") r = await perderCotacao(u, id, txt(f, "motivo"));
  else if (acao === "cancelar") r = await cancelarCotacao(u, id);
  else return comErro(caminho, "Ação inválida");
  if (!r.ok) comErro(caminho, r.erro);
  revalidatePath(caminho);
  redirect(`${caminho}?ok=1`);
}

// ---------- Usuários (admin) ----------

export async function salvarUsuario(f: FormData) {
  await exigirAdmin();
  const id = Number(txt(f, "id")) || null;
  const nome = txt(f, "nome");
  const usuario = txt(f, "usuario").toLowerCase();
  const senha = txt(f, "senha");
  const papel = txt(f, "papel") === "ADMIN" ? "ADMIN" : "VENDEDOR";
  const telefone = normalizarTelefone(txt(f, "telefone")) || null;
  const ativo = f.get("ativo") === "on";

  if (!nome || !usuario) comErro("/vendedores", "Informe nome e usuário");
  if (!/^[a-z0-9._-]{3,}$/.test(usuario)) comErro("/vendedores", "Usuário: mínimo 3 caracteres, sem espaços ou acentos");
  if (telefone && !/^\d{12,13}$/.test(telefone)) comErro("/vendedores", "Telefone inválido. Use DDD + número, ex: (11) 98765-4321");
  if (!id && senha.length < 6) comErro("/vendedores", "Senha com no mínimo 6 caracteres");
  if (id && senha && senha.length < 6) comErro("/vendedores", "Senha com no mínimo 6 caracteres");

  try {
    if (id) {
      await q(
        `UPDATE usuarios SET nome=$2, usuario=$3, papel=$4, telefone=$5, ativo=$6,
           wa_id = CASE WHEN telefone IS DISTINCT FROM $5 THEN NULL ELSE wa_id END
         WHERE id=$1`,
        [id, nome, usuario, papel, telefone, ativo],
      );
      if (senha) await q(`UPDATE usuarios SET senha_hash=$2 WHERE id=$1`, [id, await bcrypt.hash(senha, 10)]);
    } else {
      await q(`INSERT INTO usuarios (nome, usuario, senha_hash, papel, telefone, ativo) VALUES ($1,$2,$3,$4,$5,TRUE)`, [
        nome,
        usuario,
        await bcrypt.hash(senha, 10),
        papel,
        telefone,
      ]);
    }
  } catch (e: any) {
    if (String(e?.message).includes("unique") || e?.code === "23505")
      comErro("/vendedores", "Usuário ou telefone já cadastrado para outra pessoa");
    throw e;
  }
  revalidatePath("/vendedores");
  redirect("/vendedores?ok=1");
}
