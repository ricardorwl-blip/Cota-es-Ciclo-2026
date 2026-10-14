import { redirect } from "next/navigation";
import { entrar } from "../acoes";
import { q } from "../../lib/db";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const [{ n }] = await q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM usuarios`);
  if (n === 0) redirect("/setup");

  return (
    <div className="login-wrap">
      <div className="login">
        <h1>Cotações Ciclo</h1>
        <p className="sub" style={{ margin: 0 }}>Entre com seu usuário e senha</p>
        <form action={entrar}>
          {erro && <div className="aviso erro">{erro}</div>}
          <label>
            Usuário
            <input name="usuario" autoComplete="username" autoCapitalize="none" required autoFocus />
          </label>
          <label>
            Senha
            <input name="senha" type="password" autoComplete="current-password" required />
          </label>
          <button className="btn" type="submit">Entrar</button>
        </form>
      </div>
    </div>
  );
}
