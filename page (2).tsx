import { exigirUsuario } from "../../../../lib/auth";
import { listarVendedores } from "../../../../lib/consultas";
import { novaCotacao } from "../../../acoes";

export const dynamic = "force-dynamic";

export default async function Nova({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const u = await exigirUsuario();
  const { erro } = await searchParams;
  const vendedores = u.papel === "ADMIN" ? (await listarVendedores()).filter((v) => v.ativo) : [];

  return (
    <>
      <h1>Nova cotação</h1>
      <p className="sub">Também dá para abrir pelo WhatsApp: envie 1 para o número de cotações.</p>
      {erro && <div className="aviso erro">{erro}</div>}
      <form action={novaCotacao} className="cartao grade-form">
        {u.papel === "ADMIN" && (
          <label>
            Vendedor
            <select name="vendedor_id" defaultValue={u.id}>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Cliente
          <input name="cliente" required placeholder="Nome ou CNPJ" />
        </label>
        <label>
          Produto
          <input name="produto" required placeholder="ex: PEBDL LL118/21" />
        </label>
        <label>
          Quantidade
          <input name="quantidade" required placeholder="25000 ou 25 t" />
        </label>
        <label>
          Frete
          <select name="frete" defaultValue="CIF">
            <option>CIF</option>
            <option>FOB</option>
          </select>
        </label>
        <label>
          Condição de pagamento
          <input name="pagamento" required placeholder="ex: 28/56 dias" />
        </label>
        <label className="inteiro">
          Observações
          <textarea name="observacoes" placeholder="Cidade de entrega, prazo, concorrente, preço-alvo…" />
        </label>
        <div className="inteiro">
          <button className="btn verde" type="submit">
            Enviar para precificação
          </button>
        </div>
      </form>
    </>
  );
}
