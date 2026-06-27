// Consumer: imports symbols several different ways so the unused-export
// detector can be characterized. This file exports nothing, so it cannot
// itself produce unused_export warnings.
import { usedDirect } from './lib';
import { reExported } from './barrel';
import { starFn } from './barrel';
import * as ns from './namespace-target';

usedDirect();
reExported();
starFn();
ns.nsA();
