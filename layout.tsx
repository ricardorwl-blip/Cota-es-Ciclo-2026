import Link from "next/link";
import { exigirUsuario } from "../../lib/auth";
import { sair } from "../acoes";

export const dynamic = "force-dynamic";

export default async function Painel({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
  return (
    <>
      <header className="topo">
        <div className="marca">
          <span /> Cotações Ciclo
        </div>
        <nav>
          <Link href="/cotacoes">Cotações</Link>
          <Link href="/cotacoes/nova">Nova</Link>
          {u.papel === "ADMIN" && <Link href="/vendedores">Vendedores</Link>}
        </nav>
        <div className="quem">
          <span>
            {u.nome} {u.papel === "ADMIN" ? "· Admin" : ""}
          </span>
          <form action={sair}>
            <button type="submit">Sair</button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
