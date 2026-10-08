import assert from "node:assert/strict";
import test from "node:test";
import { clearToken, getToken, getRememberSessionPreference, setRememberSessionPreference, setToken } from "../src/services/api.js";

function storageFixture() {
  const data = new Map();
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
}

function withStorage(run) {
  const previousLocal=Object.getOwnPropertyDescriptor(globalThis,"localStorage");
  const previousSession=Object.getOwnPropertyDescriptor(globalThis,"sessionStorage");
  const local=storageFixture(); const session=storageFixture();
  Object.defineProperty(globalThis,"localStorage",{value:local,writable:true,configurable:true});
  Object.defineProperty(globalThis,"sessionStorage",{value:session,writable:true,configurable:true});
  try { run({local,session}); }
  finally {
    if (previousLocal) Object.defineProperty(globalThis,"localStorage",previousLocal); else delete globalThis.localStorage;
    if (previousSession) Object.defineProperty(globalThis,"sessionStorage",previousSession); else delete globalThis.sessionStorage;
  }
}

test("remembered token survives reopening while temporary token ends with the tab session", () => withStorage(({local})=>{
  setToken("synthetic-session-one",{remember:true});
  assert.equal(local.getItem("casasync_token"),"synthetic-session-one");
  globalThis.sessionStorage=storageFixture();
  assert.equal(getToken(),"synthetic-session-one");
  setToken("synthetic-session-two",{remember:false});
  assert.equal(local.getItem("casasync_token"),null);
  assert.equal(getToken(),"synthetic-session-two");
  globalThis.sessionStorage=storageFixture();
  assert.equal(getToken(),null);
}));

test("changing persistence clears the other token and logout clears both", () => withStorage(({local,session})=>{
  setToken("temporary",{remember:false});
  setToken("remembered",{remember:true});
  assert.equal(session.getItem("casasync_session_token"),null);
  assert.equal(getToken(),"remembered");
  clearToken();
  assert.equal(getToken(),null);
  assert.equal(local.getItem("casasync_token"),null);
}));

test("checkbox preference persists without saving an account identifier or password", () => withStorage(({local})=>{
  assert.equal(getRememberSessionPreference(),true);
  setRememberSessionPreference(false);
  assert.equal(getRememberSessionPreference(),false);
  assert.equal(local.getItem("casasync_remember_session"),"false");
  setToken("temporary",{remember:false});
  clearToken();
  assert.equal(getRememberSessionPreference(),false);
}));

test("blocked persistent storage keeps temporary login usable and reports persistence failure", () => withStorage(()=>{
  Object.defineProperty(globalThis,"localStorage",{configurable:true,get(){throw new Error("SecurityError");}});
  assert.equal(getToken(),null);
  assert.doesNotThrow(clearToken);
  assert.throws(()=>setToken("remembered",{remember:true}),/desmarque/);
  setToken("temporary",{remember:false});
  assert.equal(getToken(),"temporary");
  clearToken();
  assert.equal(getToken(),null);
}));

test("silently refused writes and stale undeletable tokens fail closed", () => withStorage(({local})=>{
  local.setItem=()=>{};
  assert.throws(()=>setToken("remembered",{remember:true}),/navegador/);
  local.setItem=()=>{};
  local.getItem=()=>"stale-session";
  local.removeItem=()=>{throw new Error("SecurityError");};
  assert.throws(()=>setToken("different-session",{remember:false}),/navegador/);
}));
