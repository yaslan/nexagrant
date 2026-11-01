'use server';
export async function actReqAs() {
  const r = require as any;
  return r('@/lib/probe116-svc').run();
}
