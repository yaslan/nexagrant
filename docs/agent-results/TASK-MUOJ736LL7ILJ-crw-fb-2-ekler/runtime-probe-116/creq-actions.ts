'use server';
import { createRequire } from 'node:module';
export async function actCreq() {
  return createRequire(import.meta.url)('@/lib/probe116-svc').run();
}
