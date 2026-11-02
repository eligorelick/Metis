import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { expect, it, vi } from "vitest";
import { installNoLiveNetworkGuard } from "./setup/noLiveNetwork";
it("TEST-203 refuses Node transports before reaching a socket or resolver, passing loopback",async()=>{
 for(const [module, key] of [[http,"request"],[http,"get"],[https,"request"],[https,"get"],[dns,"lookup"],[dnsPromises,"lookup"]] as const){
  const original=Reflect.get(module,key);
  const stub=vi.fn(()=>Promise.resolve([]));
  Object.defineProperty(module,key,{value:stub,writable:true,configurable:true});
  try {
   installNoLiveNetworkGuard();
   const call=Reflect.get(module,key) as (...args: unknown[])=>unknown;
   try { await call(module===dns||module===dnsPromises?"example.invalid":"https://example.invalid/"); expect.fail("guard accepted remote transport"); }
   catch(e){ expect(String(e)).toContain("live network is disabled in the test suite"); }
   expect(stub).not.toHaveBeenCalled();
   await call(module===dns||module===dnsPromises?"127.0.0.1":"http://127.0.0.1/");
   expect(stub).toHaveBeenCalledTimes(1);
  } finally { Object.defineProperty(module,key,{value:original,writable:true,configurable:true}); syncBuiltinESMExports(); }
 }
});
it("TEST-203 isolates every credential and data directory variable",()=>{
 for(const key of ["XDG_DATA_HOME","APPDATA"]) expect(process.env[key]).toBe(process.env.HOME);
});
