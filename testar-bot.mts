// Simula conversas do bot com um Postgres em memória (PGlite). Uso: npm run test:bot
import { PGlite } from "@electric-sql/pglite";
import bcrypt from "bcryptjs";

const g = globalThis as any;
const pg = new PGlite();
g.__testQuery = async (sql: string, params: unknown[] = []) => {
  const r = await pg.query(sql, params as any[]);
  return { rows: r.rows };
};
g.__waOutbox = [];

const { q } = await import("../lib/db");
const { processarMensagem } = await import("../lib/bot");

let falhas = 0;
function checar(cond: boolean, desc: string) {
  console.log(`${cond ? "✔" : "✘"} ${desc}`);
  if (!cond) falhas++;
}

const ADMIN = "5511999990000";
const VEND = "5511988887777";
const VEND_SEM9 = "551188887777"; // como o WhatsApp às vezes entrega
const ESTRANHO = "5511900000000";

const h = bcrypt.hashSync("x", 4);
await q(`INSERT INTO usuarios (nome, usuario, senha_hash, papel, telefone) VALUES ('Ricardo','admin',$1,'ADMIN',$2)`, [h, ADMIN]);
await q(`INSERT INTO usuarios (nome, usuario, senha_hash, papel, telefone) VALUES ('Alan Souza','alan',$1,'VENDEDOR',$2)`, [h, VEND]);

let n = 0;
async function msg(de: string, texto: string, respostaA?: string) {
  g.__waOutbox = [];
  await processarMensagem({ de, texto, waMsgId: `in-${++n}`, respostaA });
  const out = g.__waOutbox as { para: string; texto: string }[];
  console.log(`\n>> [${de === ADMIN ? "ADMIN" : de === ESTRANHO ? "?" : "VEND"}] ${texto}`);
  for (const o of out) console.log(`<< para ${o.para}:\n${o.texto.split("\n").map((l) => "   " + l).join("\n")}`);
  return out;
}

let out = await msg(ESTRANHO, "oi");
checar(out[0]?.texto.includes("não está cadastrado"), "número desconhecido é recusado");

out = await msg(VEND_SEM9, "oi");
checar(out[0]?.texto.includes("Nova cotação"), "vendedor reconhecido mesmo sem o 9º dígito");

await msg(VEND_SEM9, "1");
await msg(VEND_SEM9, "Plásticos Oriente");
await msg(VEND_SEM9, "PEBDL LL118/21");
out = await msg(VEND_SEM9, "dez toneladas");
checar(out[0]?.texto.includes("Não entendi"), "quantidade inválida pede de novo");
await msg(VEND_SEM9, "25 t");
await msg(VEND_SEM9, "1");
await msg(VEND_SEM9, "28/56 dias");
out = await msg(VEND_SEM9, "Entrega em Diadema, concorrente a 9,90");
checar(out[0]?.texto.includes("25 t") && out[0]?.texto.includes("CIF"), "resumo de confirmação correto");
out = await msg(VEND_SEM9, "1");
const avisoAdmin = out.find((o) => o.para === ADMIN);
checar(!!avisoAdmin && avisoAdmin.texto.includes("Cotação #1"), "admin recebe aviso da nova cotação");
checar(out.some((o) => o.para === VEND_SEM9 && o.texto.includes("#1 enviada")), "vendedor recebe confirmação");

// admin responde citando a mensagem
const [{ wa_msg_id }] = await q<{ wa_msg_id: string }>(
  `SELECT wa_msg_id FROM mensagens WHERE direcao='SAIDA' AND telefone=$1 AND cotacao_id=1 ORDER BY id DESC LIMIT 1`,
  [ADMIN],
);
out = await msg(ADMIN, "9,85 validade até sexta", wa_msg_id);
const precoVend = out.find((o) => o.para === VEND_SEM9);
checar(!!precoVend && precoVend.texto.includes("R$ 9,85/kg") && precoVend.texto.includes("246.250,00"), "vendedor recebe preço e total");

out = await msg(ADMIN, "preço 1 9,70 baixei");
checar(out.some((o) => o.para === VEND_SEM9 && o.texto.includes("revisado")), "admin revisa preço por comando");

out = await msg(VEND_SEM9, "preco 1 1,00");
checar(out[0]?.texto.includes("Só o administrador"), "vendedor não pode informar preço");

out = await msg(VEND_SEM9, "fechou 1");
checar(out.some((o) => o.para === ADMIN && o.texto.includes("Pedido fechado")), "fechamento avisa o admin");

// segunda cotação, perdida com motivo em duas etapas
for (const t of ["nova", "Selpack", "PP H503", "12000", "fob", "à vista", "-", "1"]) await msg(VEND_SEM9, t);
await msg(ADMIN, "preco 2 8,40");
out = await msg(VEND_SEM9, "perdeu 2");
checar(out[0]?.texto.includes("motivo"), "perda sem motivo pergunta o motivo");
out = await msg(VEND_SEM9, "preço alto");
checar(out.some((o) => o.para === ADMIN && o.texto.includes("preço alto")), "perda registrada com motivo");

out = await msg(VEND_SEM9, "2");
checar(out[0]?.texto.includes("#1") && out[0]?.texto.includes("#2"), "lista das últimas cotações");

out = await msg(ADMIN, "pendentes");
checar(out[0]?.texto.includes("Nenhuma cotação em aberto"), "admin: sem pendentes");

const ev = await q(`SELECT tipo FROM eventos WHERE cotacao_id=1 ORDER BY id`);
checar(ev.map((e: any) => e.tipo).join(",") === "CRIADA,RESPONDIDA,PRECO_REVISADO,FECHADA", "histórico de eventos completo");

const dup = (g.__waOutbox = [], await processarMensagem({ de: VEND_SEM9, texto: "oi", waMsgId: "in-1" }), g.__waOutbox.length);
checar(dup === 0, "mensagem repetida pela Meta é ignorada");

console.log(`\n${falhas ? `❌ ${falhas} falha(s)` : "✅ Todos os testes passaram"}`);
process.exit(falhas ? 1 : 0);
