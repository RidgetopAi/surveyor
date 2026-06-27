// Part of a file-level circular dependency: a -> b -> a
import { fromB } from './b';

export function fromA(): string {
  return `a:${fromB()}`;
}
