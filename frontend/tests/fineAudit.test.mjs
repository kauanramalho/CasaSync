import assert from "node:assert/strict";
import test from "node:test";
import { fitPopover } from "../src/utils/popover.js";
import { parseLocalDateTime, withSelectedDay } from "../src/utils/dateTimeInput.js";
import { validateProfileSubmission } from "../src/utils/profileValidation.js";
import { activateDialog } from "../src/utils/dialogFocus.js";
import { getTaskActivityDate } from "../src/utils/tasks.js";

test("completed task activity shows the actual completion date, never its future deadline", () => {
  const task = { status:"concluida",completed_at:"2026-10-08T12:00:00Z",due_date:"2026-10-13T12:00:00Z" };
  assert.equal(getTaskActivityDate(task),task.completed_at);
  assert.equal(getTaskActivityDate({...task,status:"pendente"}),task.due_date);
  assert.equal(getTaskActivityDate({...task,completed_at:null}),null);
});

test("date selection preserves midnight and defaults an unset time to 09:00", () => {
  const day = new Date(2026, 9, 12);
  assert.equal(withSelectedDay(day, new Date(2026, 9, 8, 0, 30)).getHours(), 0);
  assert.equal(withSelectedDay(day, new Date(2026, 9, 8, 0, 30)).getMinutes(), 30);
  assert.equal(withSelectedDay(day, null).getHours(), 9);
});
test("invalid dates are rejected instead of being silently moved to another month", () => {
  for (const value of ["2026-02-31T12:00", "2026-13-08T12:00", "2026-10-08T24:00", "invalid", "2026-10-08T12:60"]) assert.equal(parseLocalDateTime(value), null);
  assert.equal(parseLocalDateTime("2026-10-08T00:00").getHours(), 0);
});
for (const viewport of [{ width:320,height:568 }, { width:390,height:844 }, { width:844,height:390 }, { width:768,height:1024 }, { width:1366,height:768 }, { width:390,height:280 }]) {
  test(`popovers fit ${viewport.width}x${viewport.height} including keyboard/landscape`, () => {
    for (const top of [0, 120, viewport.height - 48]) {
      const style = fitPopover({ left:viewport.width - 50, top, bottom:top+48,width:180 }, viewport, { preferredWidth:380,preferredHeight:700 });
      assert.ok(style.top >=16 && style.left >=16);
      assert.ok(style.top + style.maxHeight <= viewport.height -16);
      assert.ok(style.left + style.width <= viewport.width -16);
    }
  });
}
const form = { username:"qa", email:"qa@example.com" };
const validForm = { ...form, username:"qa-local" };
test("profile confirmation is checked before any upload or update", () => {
  assert.match(validateProfileSubmission(validForm, { current_password:"present",new_password:"NewPass123",confirm_password:"different" }, form.email), /nao confere/);
});
test("profile prevents email verification from silently skipping password changes", () => {
  assert.match(validateProfileSubmission({ ...validForm,email:"other@example.com" }, { current_password:"present",new_password:"NewPass123",confirm_password:"NewPass123" }, form.email), /separadamente/);
});
test("profile accepts unchanged password fields and a valid password change", () => {
  assert.equal(validateProfileSubmission(validForm, {}, form.email), "");
  assert.equal(validateProfileSubmission(validForm, { current_password:"present",new_password:"NewPass123",confirm_password:"NewPass123" }, form.email), "");
});

function dialogFixture() {
  const handlers = {};
  const doc = { body:{ style:{ overflow:"auto" } }, addEventListener(name,handler) { (handlers[name] ||= []).push(handler); }, removeEventListener(name,handler) { handlers[name] = handlers[name].filter((item)=>item!==handler); } };
  const button = (name) => ({ name,tabIndex:0,isConnected:true,focus() { doc.activeElement=this; },getClientRects() { return [1]; },closest() { return null; },getAttribute() { return null; } });
  const trigger = button("trigger"); doc.activeElement=trigger;
  const root = (nodes) => ({ ownerDocument:doc,querySelectorAll:()=>nodes,contains:(node)=>nodes.includes(node),focus() { doc.activeElement=this; } });
  const key = (name,shiftKey=false) => {
    const event = { key:name,shiftKey,preventDefault() { this.prevented=true; },stopImmediatePropagation() { this.stopped=true; } };
    for (const handler of [...handlers.keydown]) { handler(event); if (event.stopped) break; }
    return event;
  };
  return { doc,button,root,trigger,key };
}
test("nested dialogs close only the top layer and preserve the parent's scroll lock", () => {
  const {doc,button,root,trigger,key}=dialogFixture();
  let parentClosed=0,childClosed=0;
  const parentButton=button("parent");
  const closeParent=activateDialog(root([parentButton]),()=>parentClosed++);
  const closeChild=activateDialog(root([button("child")]),()=>childClosed++,{modal:false});
  key("Escape");
  assert.equal(parentClosed,0); assert.equal(childClosed,1); assert.equal(doc.body.style.overflow,"hidden");
  closeChild(); assert.equal(doc.activeElement,parentButton);
  closeParent(); assert.equal(doc.body.style.overflow,"auto"); assert.equal(doc.activeElement,trigger);
});
test("dialog traps forward and reverse Tab, including textarea/select and escaped focus", () => {
  const {doc,button,root,key}=dialogFixture();
  const first=button("first"), last=button("textarea");
  const close=activateDialog(root([first,last]),()=>{});
  key("Tab",true); assert.equal(doc.activeElement,last);
  key("Tab"); assert.equal(doc.activeElement,first);
  doc.activeElement=button("outside"); key("Tab"); assert.equal(doc.activeElement,first);
  close();
});
test("out-of-order unmounts never unlock a still-open modal", () => {
  const {doc,button,root}=dialogFixture();
  const closeParent=activateDialog(root([button("parent")]),()=>{});
  const closeChild=activateDialog(root([button("child")]),()=>{});
  closeParent(); assert.equal(doc.body.style.overflow,"hidden");
  closeChild(); assert.equal(doc.body.style.overflow,"auto");
});
