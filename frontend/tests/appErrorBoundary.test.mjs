import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AppErrorBoundary from "../src/components/AppErrorBoundary.js";

test("normal rendering preserves children", () => {
  const html = renderToStaticMarkup(createElement(AppErrorBoundary, null, createElement("p", null, "Tarefas")));
  assert.equal(html, "<p>Tarefas</p>");
});

test("recovery screen offers navigation without exposing exception data", () => {
  const boundary = new AppErrorBoundary({ children: "private original content" });
  boundary.state = AppErrorBoundary.getDerivedStateFromError(new Error("secret-token"));
  const html = renderToStaticMarkup(boundary.render());
  assert.match(html, /Recarregar tela/);
  assert.match(html, /Voltar ao inicio/);
  assert.doesNotMatch(html, /secret-token|private original content/);
});
