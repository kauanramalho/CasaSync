import LogoMark from "../components/LogoMark";

export default function AuthLayout({ children, title, subtitle }) {
  return (
    <main className="min-h-screen px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[32px] border border-white/80 bg-white/70 shadow-soft backdrop-blur-xl lg:grid-cols-[1fr_0.9fr]">
        <section className="flex flex-col justify-center p-8 md:p-12">
          <LogoMark />
          <div className="mt-12 max-w-md">
            <h1 className="text-3xl font-bold text-ink md:text-4xl">{title}</h1>
            <p className="mt-3 text-muted">{subtitle}</p>
          </div>
          <div className="mt-8">{children}</div>
        </section>
        <aside className="hidden border-l border-white/80 bg-gradient-to-br from-rose-50 via-white to-violet-50 p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="rounded-[28px] bg-white/75 p-6 shadow-card">
            <p className="text-sm font-semibold text-muted">Meta semanal do casal</p>
            <div className="mt-6 flex items-center gap-5">
              <div className="grid h-24 w-24 place-items-center rounded-full bg-[conic-gradient(#f85d8f_280deg,#ffe6dd_0)]">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-white text-lg font-bold">78%</div>
              </div>
              <div>
                <p className="text-2xl font-bold text-ink">21 / 27</p>
                <p className="text-sm text-muted">tarefas concluídas</p>
              </div>
            </div>
          </div>
          <div className="rounded-[28px] bg-white/75 p-6 shadow-card">
            <p className="text-lg font-bold text-ink">Pequenas ações, grandes conexões.</p>
            <p className="mt-2 text-sm text-muted">Organização da casa, estudos, fé, saúde e relacionamento em um só espaço.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}

