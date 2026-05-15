import LogoMark from "../components/LogoMark";

export default function AuthLayout({ children, title, subtitle }) {
  return (
    <main className="min-h-screen px-3 py-4 sm:px-4 sm:py-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-6xl min-w-0 overflow-hidden rounded-[24px] border border-white/80 bg-white/70 shadow-soft backdrop-blur-xl sm:min-h-[calc(100vh-4rem)] sm:rounded-[32px] lg:grid-cols-[1fr_0.9fr]">
        <section className="flex min-w-0 flex-col justify-center p-5 sm:p-8 md:p-12">
          <LogoMark />
          <div className="mt-12 max-w-md">
            <h1 className="text-3xl font-bold text-ink md:text-4xl">{title}</h1>
            <p className="mt-3 text-muted">{subtitle}</p>
          </div>
          <div className="mt-8">{children}</div>
        </section>
        <aside className="hidden border-l border-white/80 bg-gradient-to-br from-rose-50 via-white to-violet-50 p-10 lg:flex lg:flex-col lg:justify-center">
          <div className="rounded-[28px] bg-white/75 p-6 shadow-card">
            <p className="text-lg font-bold text-ink">Pequenas ações, grandes conexões.</p>
            <p className="mt-2 text-sm text-muted">Organização da casa, estudos, fé, saúde e relacionamento em um só espaço.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
