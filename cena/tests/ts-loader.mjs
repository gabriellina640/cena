import { readFile, access } from 'node:fs/promises';
import ts from 'typescript';
export async function resolve(specifier, context, next) {
  if(specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
    const url=new URL(`${specifier}.ts`,context.parentURL);
    try { await access(url); return next(url.href,context); } catch {}
  }
  return next(specifier,context);
}
export async function load(url,context,next) {
  if(url.endsWith('.ts')) return {format:'module',shortCircuit:true,source:ts.transpileModule(await readFile(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText};
  return next(url,context);
}
