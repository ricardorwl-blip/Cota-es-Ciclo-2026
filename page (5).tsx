import { exigirAdmin } from "../../../lib/auth";
import { listarVendedores } from "../../../lib/consultas";
import { salvarUsuario } from "../../acoes";
import { Usuario } from "../../../lib/servico";

export const dynamic = "force-dynamic";

function telVisivel(t: string | null) {
  if (!t) return "";
  const m = t.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : t;
}

function FormUsuario({ u }: { u?: Usuario }) {
  return (
    <form action={salvarUsuario} className="grade-form" style={{ marginTop: 12 }}>
      {u && <input type="hidden" name="id" value={u.id} />}
      <label>
        Nome
        <input name="nome" defaultValue={u?.nome} required />
      </label>
      <label>
        Usuário (login)
        <input name="usuario" defaultValue={u?.usuario} autoCapitalize="none" required placeholder="ex: alan" />
      </label>
      <label>
        {u ? "Nova senha (deixe vazio para manter)" : "Senha (mínimo 6)"}
        <input name="senha" type="text" autoComplete="new-password" required={!u} minLength={6} />
      </label>
      <label>
        WhatsApp
        <input name="telefone" defaultValue={telVisivel(u?.telefone ?? null)} placeholder="(11) 98765-4321" inputMode="tel" />
      </label>
      <label>
        Perfil
        <select name="papel" defaultValue={u?.papel ?? "VENDEDOR"}>
          <option value="VENDEDOR">Vendedor — vê só as próprias cotações</option>
          <option value="ADMIN">Admin — vê tudo e responde preço</option>
        </select>
      </label>
      {u && (
        <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <input type="checkbox" name="ativo" defaultChecked={u.ativo} /> Ativo
        </label>
      )}
      <div className="inteiro">
        <button className="btn verde" type="submit">
          {u ? "Salvar alterações" : "Cadastrar"}
        </button>
      </div>
    </form>
  );
}

export default async function Vendedores({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  await exigirAdmin();
  const { erro, ok } = await searchParams;
  const usuarios = await listarVendedores();

  return (
    <>
      <h1>Vendedores e acessos</h1>
      <p className="sub">
        Cada vendedor entra no painel com seu usuário e senha e vê só as próprias cotações. O WhatsApp cadastrado é o que
        o bot reconhece.
      </p>
      {erro && <div className="aviso erro">{erro}</div>}
      {ok && <div className="aviso ok">Salvo.</div>}

      <div className="cartao">
        <h2>Novo vendedor</h2>
        <FormUsuario />
      </div>

      <div className="cartao">
        <h2>Cadastrados</h2>
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Usuário</th>
                <th>WhatsApp</th>
                <th>Perfil</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.nome}</strong>
                    <details className="editar">
                      <summary>editar</summary>
                      <FormUsuario u={u} />
                    </details>
                  </td>
                  <td>{u.usuario}</td>
                  <td>
                    {telVisivel(u.telefone) || <span className="muted">—</span>}
                    {u.telefone && !u.wa_id && <div className="muted">ainda não falou com o bot</div>}
                  </td>
                  <td>{u.papel === "ADMIN" ? "Admin" : "Vendedor"}</td>
                  <td>{u.ativo ? "Ativo" : <span className="muted">Inativo</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
