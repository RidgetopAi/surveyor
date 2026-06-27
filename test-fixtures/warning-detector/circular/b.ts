// Part of a file-level circular dependency: a -> b -> a
import { fromA } from './a';

export function fromB(): string {
  return 'b';
}

export function callA(): string {
  return fromA();
}
