import { q } from "./db";

const API = "https://graph.facebook.com/v21.0";

type Envio = { para: string; texto: string; usuarioId?: number | null; cotacaoId?: number | null };

const g = globalThis as unknown as { __waOutbox?: Envio[] };

async function chamarApi(corpo: unknown): Promise<{ ok: boolean; id?: string; codigo?: number; erro?: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, erro: "WhatsApp não configurado" };
  const r = await fetch(`${API}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, codigo: j?.error?.code, erro: j?.error?.message || `HTTP ${r.status}` };
  return { ok: true, id: j?.messages?.[0]?.id };
}

/**
 * Envia texto. Se a pessoa não falou com o número nas últimas 24h (regra da Meta),
 * cai para o modelo aprovado (WHATSAPP_TEMPLATE) levando o texto como variável.
 */
export async function enviarTexto({ para, texto, usuarioId = null, cotacaoId = null }: Envio): Promise<boolean> {
  let res: { ok: boolean; id?: string; codigo?: number; erro?: string };

  if (g.__waOutbox) {
    g.__waOutbox.push({ para, texto, usuarioId, cotacaoId });
    res = { ok: true, id: `teste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  } else {
    res = await chamarApi({
      messaging_product: "whatsapp",
      to: para,
      type: "text",
      text: { body: texto.slice(0, 4000), preview_url: false },
    });

    const fora24h = res.codigo === 131047 || res.codigo === 131026;
    const modelo = process.env.WHATSAPP_TEMPLATE;
    if (!res.ok && fora24h && modelo) {
      const plano = texto.replace(/\*/g, "").replace(/\s*\n+\s*/g, " | ").replace(/\s{2,}/g, " ").slice(0, 900);
      res = await chamarApi({
        messaging_product: "whatsapp",
        to: para,
        type: "template",
        template: {
          name: modelo,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR" },
          components: [{ type: "body", parameters: [{ type: "text", text: plano }] }],
        },
      });
    }
    if (!res.ok) console.error("[whatsapp] falha ao enviar para", para, res.erro);
  }

  await q(
    `INSERT INTO mensagens (telefone, direcao, texto, wa_msg_id, usuario_id, cotacao_id)
     VALUES ($1, 'SAIDA', $2, $3, $4, $5)`,
    [para, res.ok ? texto : `[NÃO ENTREGUE: ${res.erro}] ${texto}`, res.id ?? null, usuarioId, cotacaoId],
  );
  return res.ok;
}

export async function marcarComoLida(waMsgId: string) {
  if (g.__waOutbox) return;
  await chamarApi({ messaging_product: "whatsapp", status: "read", message_id: waMsgId }).catch(() => {});
}
