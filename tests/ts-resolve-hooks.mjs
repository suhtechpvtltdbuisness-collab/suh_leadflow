/**
 * Minimal ESM resolve hook so `node --test` can load the project's TypeScript
 * modules through Node's built-in type stripping.
 *
 * Node requires a full specifier in ESM, while the `lib/` sources use the
 * extensionless and `@/`-aliased specifiers that Next and `tsconfig.json`
 * expect. This bridges the two with no build step and no dependencies.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HAS_EXTENSION = /\.[mc]?[jt]sx?$/;
const CANDIDATE_SUFFIXES = [".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"];

function firstExisting(absoluteBase) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = absoluteBase + suffix;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let target = specifier;
  // Absent for the entry point, where there is nothing relative to resolve.
  const parentDir = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : null;

  // `@/lib/x` -> `<projectRoot>/lib/x`, matching tsconfig `paths`.
  if (target.startsWith("@/")) target = path.join(projectRoot, target.slice(2));

  // `./connector-contract.mjs` -> `./connector-contract.mts`
  if (target.endsWith(".mjs")) {
    if (!path.isAbsolute(target) && !parentDir) return nextResolve(specifier, context);
    const absolute = path.isAbsolute(target) ? target : path.resolve(parentDir, target);
    const asMts = absolute.replace(/\.mjs$/, ".mts");
    if (existsSync(asMts)) return nextResolve(pathToFileURL(asMts).href, context);
  }

  const relative = target.startsWith("./") || target.startsWith("../");
  if (!HAS_EXTENSION.test(target) && (relative || path.isAbsolute(target))) {
    if (!path.isAbsolute(target) && !parentDir) return nextResolve(specifier, context);
    const absolute = path.isAbsolute(target) ? target : path.resolve(parentDir, target);
    const resolved = firstExisting(absolute);
    if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
  }

  return nextResolve(path.isAbsolute(target) ? pathToFileURL(target).href : target, context);
}
