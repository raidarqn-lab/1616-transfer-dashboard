// Bundle the separately installed private library into a private deployment artifact.
// Never commit the generated bundle or copy Toolkit source into the public portal repo.
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
const [toolkit,esbuild,output]=process.argv.slice(2);
if(!toolkit||!esbuild||!output)throw Error('Usage: node build-edge.mjs TOOLKIT_ROOT ESBUILD_BINARY PRIVATE_OUTPUT');
const root=realpathSync(toolkit),pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
if(pkg.name!=='@extrageneity/lw-toolkit'||pkg.version!=='0.6.0')throw Error('Review the LWToolkit version before rebuilding.');
const target=resolve(output),repo=realpathSync(new URL('../../',import.meta.url));
if(target.startsWith(repo+'/'))throw Error('The private Toolkit bundle must be written outside the public checkout.');
execFileSync(esbuild,[join(repo,'backend/portal-public.ts'),'--bundle','--format=esm','--platform=node','--target=es2022','--minify','--banner:js=import { createRequire as toolkitCreateRequire } from "node:module"; const require=toolkitCreateRequire(import.meta.url);',
 '--alias:@extrageneity/lw-toolkit/client='+join(root,'dist/src/client.js'),
 '--alias:@extrageneity/lw-toolkit/transport='+join(root,'dist/src/transport.js'),'--outfile='+target],{stdio:'inherit'});
