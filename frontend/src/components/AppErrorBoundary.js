import { Component, createElement as h } from "react";

export default class AppErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    // Never display or log exception payloads, which may contain private data.
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return h("main", { className: "mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 px-6 py-12", role: "alert" },
      h("p", { className: "font-bold text-blush" }, "CasaSync"),
      h("h1", { className: "page-title" }, "Nao foi possivel abrir esta tela"),
      h("p", { className: "text-sm text-muted" }, "Tente recarregar ou voltar ao inicio. Alteracoes que ainda nao foram salvas podem precisar ser preenchidas novamente."),
      h("button", { type: "button", className: "min-h-12 rounded-2xl bg-blush px-4 py-3 font-semibold text-white", onClick: () => window.location.reload() }, "Recarregar tela"),
      h("a", { href: "/", className: "min-h-12 rounded-2xl border border-slate-200 px-4 py-3 text-center font-semibold text-ink" }, "Voltar ao inicio")
    );
  }
}
