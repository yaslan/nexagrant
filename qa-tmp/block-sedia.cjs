// QA mutant harness: make the dev server unable to reach SEDIA / MyMemory.
const orig = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const u = String(input && input.url ? input.url : input);
  if (/europa\.eu|mymemory\.translated\.net/.test(u)) return Promise.reject(new Error('QA-BLOCKED ' + u));
  return orig.call(this, input, init);
};
