(function(){var e=Object.create,t=Object.defineProperty,n=Object.getOwnPropertyDescriptor,r=Object.getOwnPropertyNames,i=Object.getPrototypeOf,a=Object.prototype.hasOwnProperty,o=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t),e=null),t.exports),s=(e,i,o,s)=>{if(i&&typeof i==`object`||typeof i==`function`)for(var c=r(i),l=0,u=c.length,d;l<u;l++)d=c[l],!a.call(e,d)&&d!==o&&t(e,d,{get:(e=>i[e]).bind(null,d),enumerable:!(s=n(i,d))||s.enumerable});return e},c=(n,r,a)=>(a=n==null?{}:e(i(n)),s(r||!n||!n.__esModule?t(a,`default`,{value:n,enumerable:!0}):a,n)),l=o(((e,t)=>{t.exports={}})),u=Object.defineProperty,d=(e,t)=>u(e,`name`,{value:t,configurable:!0}),ee=(e=>typeof require<`u`?require:typeof Proxy<`u`?new Proxy(e,{get:(e,t)=>(typeof require<`u`?require:e)[t]}):e)(function(e){if(typeof require<`u`)return require.apply(this,arguments);throw Error(`Dynamic require of "`+e+`" is not supported`)}),te=(()=>{for(var e=new Uint8Array(128),t=0;t<64;t++)e[t<26?t+65:t<52?t+71:t<62?t-4:t*4-205]=t;return t=>{for(var n=t.length,r=new Uint8Array((n-(t[n-1]==`=`)-(t[n-2]==`=`))*3/4|0),i=0,a=0;i<n;){var o=e[t.charCodeAt(i++)],s=e[t.charCodeAt(i++)],c=e[t.charCodeAt(i++)],l=e[t.charCodeAt(i++)];r[a++]=o<<2|s>>4,r[a++]=s<<4|c>>2,r[a++]=c<<6|l}return r}})();function f(e){return!isNaN(parseFloat(e))&&isFinite(e)}d(f,`_isNumber`);function p(e){return e.charAt(0).toUpperCase()+e.substring(1)}d(p,`_capitalize`);function m(e){return function(){return this[e]}}d(m,`_getter`);var h=[`isConstructor`,`isEval`,`isNative`,`isToplevel`],g=[`columnNumber`,`lineNumber`],_=[`fileName`,`functionName`,`source`],v=h.concat(g,_,[`args`],[`evalOrigin`]);function y(e){if(e)for(var t=0;t<v.length;t++)e[v[t]]!==void 0&&this[`set`+p(v[t])](e[v[t]])}for(d(y,`StackFrame`),y.prototype={getArgs:d(function(){return this.args},`getArgs`),setArgs:d(function(e){if(Object.prototype.toString.call(e)!==`[object Array]`)throw TypeError(`Args must be an Array`);this.args=e},`setArgs`),getEvalOrigin:d(function(){return this.evalOrigin},`getEvalOrigin`),setEvalOrigin:d(function(e){if(e instanceof y)this.evalOrigin=e;else if(e instanceof Object)this.evalOrigin=new y(e);else throw TypeError(`Eval Origin must be an Object or StackFrame`)},`setEvalOrigin`),toString:d(function(){var e=this.getFileName()||``,t=this.getLineNumber()||``,n=this.getColumnNumber()||``,r=this.getFunctionName()||``;return this.getIsEval()?e?`[eval] (`+e+`:`+t+`:`+n+`)`:`[eval]:`+t+`:`+n:r?r+` (`+e+`:`+t+`:`+n+`)`:e+`:`+t+`:`+n},`toString`)},y.fromString=d(function(e){var t=e.indexOf(`(`),n=e.lastIndexOf(`)`),r=e.substring(0,t),i=e.substring(t+1,n).split(`,`),a=e.substring(n+1);if(a.indexOf(`@`)===0)var o=/@(.+?)(?::(\d+))?(?::(\d+))?$/.exec(a,``),s=o[1],c=o[2],l=o[3];return new y({functionName:r,args:i||void 0,fileName:s,lineNumber:c||void 0,columnNumber:l||void 0})},`StackFrame$$fromString`),b=0;b<h.length;b++)y.prototype[`get`+p(h[b])]=m(h[b]),y.prototype[`set`+p(h[b])]=function(e){return function(t){this[e]=!!t}}(h[b]);var b;for(x=0;x<g.length;x++)y.prototype[`get`+p(g[x])]=m(g[x]),y.prototype[`set`+p(g[x])]=function(e){return function(t){if(!f(t))throw TypeError(e+` must be a Number`);this[e]=Number(t)}}(g[x]);var x;for(S=0;S<_.length;S++)y.prototype[`get`+p(_[S])]=m(_[S]),y.prototype[`set`+p(_[S])]=function(e){return function(t){this[e]=String(t)}}(_[S]);var S,C=y;function ne(){var e=/^\s*at .*(\S+:\d+|\(native\))/m,t=/^(eval@)?(\[native code])?$/;return{parse:d(function(t){if(t.stack&&t.stack.match(e))return this.parseV8OrIE(t);if(t.stack)return this.parseFFOrSafari(t);throw Error(`Cannot parse given Error object`)},`ErrorStackParser$$parse`),extractLocation:d(function(e){if(e.indexOf(`:`)===-1)return[e];var t=/(.+?)(?::(\d+))?(?::(\d+))?$/.exec(e.replace(/[()]/g,``));return[t[1],t[2]||void 0,t[3]||void 0]},`ErrorStackParser$$extractLocation`),parseV8OrIE:d(function(t){return t.stack.split(`
`).filter(function(t){return!!t.match(e)},this).map(function(e){e.indexOf(`(eval `)>-1&&(e=e.replace(/eval code/g,`eval`).replace(/(\(eval at [^()]*)|(,.*$)/g,``));var t=e.replace(/^\s+/,``).replace(/\(eval code/g,`(`).replace(/^.*?\s+/,``),n=t.match(/ (\(.+\)$)/);t=n?t.replace(n[0],``):t;var r=this.extractLocation(n?n[1]:t);return new C({functionName:n&&t||void 0,fileName:[`eval`,`<anonymous>`].indexOf(r[0])>-1?void 0:r[0],lineNumber:r[1],columnNumber:r[2],source:e})},this)},`ErrorStackParser$$parseV8OrIE`),parseFFOrSafari:d(function(e){return e.stack.split(`
`).filter(function(e){return!e.match(t)},this).map(function(e){if(e.indexOf(` > eval`)>-1&&(e=e.replace(/ line (\d+)(?: > eval line \d+)* > eval:\d+:\d+/g,`:$1`)),e.indexOf(`@`)===-1&&e.indexOf(`:`)===-1)return new C({functionName:e});var t=/((.*".+"[^@]*)?[^@]*)(?:@)/,n=e.match(t),r=n&&n[1]?n[1]:void 0,i=this.extractLocation(e.replace(t,``));return new C({functionName:r,fileName:i[0],lineNumber:i[1],columnNumber:i[2],source:e})},this)},`ErrorStackParser$$parseFFOrSafari`)}}d(ne,`ErrorStackParser`);var re=new ne;function w(){return typeof API<`u`&&API!==globalThis.API?API.runtimeEnv:E({IN_BUN:typeof Bun<`u`,IN_DENO:typeof Deno<`u`,IN_NODE:typeof process==`object`&&typeof process.versions==`object`&&typeof process.versions.node==`string`&&!process.browser,IN_SAFARI:typeof navigator==`object`&&typeof navigator.userAgent==`string`&&navigator.userAgent.indexOf(`Chrome`)===-1&&navigator.userAgent.indexOf(`Safari`)>-1,IN_SHELL:typeof read==`function`&&typeof load==`function`})}d(w,`getGlobalRuntimeEnv`);var T=w();function E(e){let t=e.IN_NODE&&typeof module<`u`&&module.exports&&typeof ee==`function`&&typeof __dirname==`string`,n=e.IN_NODE&&!t,r=!e.IN_NODE&&!e.IN_DENO&&!e.IN_BUN,i=r&&typeof window<`u`&&typeof window.document<`u`&&typeof document.createElement==`function`&&`sessionStorage`in window&&typeof globalThis.importScripts!=`function`,a=r&&typeof globalThis.WorkerGlobalScope<`u`&&typeof globalThis.self<`u`&&globalThis.self instanceof globalThis.WorkerGlobalScope;return{...e,IN_BROWSER:r,IN_BROWSER_MAIN_THREAD:i,IN_BROWSER_WEB_WORKER:a,IN_NODE_COMMONJS:t,IN_NODE_ESM:n}}d(E,`calculateDerivedFlags`);var D,O,ie,k,A;async function j(){if(!T.IN_NODE||(D=(await Promise.resolve().then(()=>c(l(),1))).default,k=await Promise.resolve().then(()=>c(l(),1)),A=await Promise.resolve().then(()=>c(l(),1)),ie=(await Promise.resolve().then(()=>c(l(),1))).default,O=await Promise.resolve().then(()=>c(l(),1)),F=O.sep,typeof ee<`u`))return;let e={fs:k,crypto:await Promise.resolve().then(()=>c(l(),1)),ws:await Promise.resolve().then(()=>c(l(),1)),child_process:await Promise.resolve().then(()=>c(l(),1))};globalThis.require=function(t){return e[t]}}d(j,`initNodeModules`);function M(e,t){return O.resolve(t||`.`,e)}d(M,`node_resolvePath`);function N(e,t){return t===void 0&&(t=location),new URL(e,t).toString()}d(N,`browser_resolvePath`);var P=T.IN_NODE?M:T.IN_SHELL?d(e=>e,`resolvePath`):N,F;T.IN_NODE||(F=`/`);function I(e,t){return e.startsWith(`file://`)&&(e=e.slice(7)),e.includes(`://`)?{response:fetch(e)}:{binary:A.readFile(e).then(e=>new Uint8Array(e.buffer,e.byteOffset,e.byteLength))}}d(I,`node_getBinaryResponse`);function L(e,t){if(e.startsWith(`file://`)&&(e=e.slice(7)),e.includes(`://`))throw Error(`Shell cannot fetch urls`);return{binary:Promise.resolve(new Uint8Array(readbuffer(e)))}}d(L,`shell_getBinaryResponse`);function R(e,t){let n=new URL(e,location);return{response:fetch(n,t?{integrity:t}:{})}}d(R,`browser_getBinaryResponse`);var z=T.IN_NODE?I:T.IN_SHELL?L:R;async function B(e,t){let{response:n,binary:r}=z(e,t);if(r)return r;let i=await n;if(!i.ok)throw Error(`Failed to load '${e}': request failed.`);return new Uint8Array(await i.arrayBuffer())}d(B,`loadBinaryFile`);var V;if(T.IN_BROWSER_MAIN_THREAD)V=d(async e=>await import(e),`loadScript`);else if(T.IN_BROWSER_WEB_WORKER)V=d(async e=>{try{globalThis.importScripts(e)}catch(t){if(t instanceof TypeError)await import(e);else throw t}},`loadScript`);else if(T.IN_NODE)V=H;else if(T.IN_SHELL)V=load;else throw Error(`Cannot determine runtime environment`);async function H(e){e.startsWith(`file://`)&&(e=e.slice(7)),e.includes(`://`)?ie.runInThisContext(await(await fetch(e)).text()):await import(D.pathToFileURL(e).href)}d(H,`nodeLoadScript`);async function U(e){if(T.IN_NODE){await j();let t=await A.readFile(e,{encoding:`utf8`});return JSON.parse(t)}else if(T.IN_SHELL){let t=read(e);return JSON.parse(t)}else return await(await fetch(e)).json()}d(U,`loadLockFile`);async function W(){if(T.IN_NODE_COMMONJS)return __dirname;let e;try{throw Error()}catch(t){e=t}let t=re.parse(e)[0].fileName;if(T.IN_NODE&&!t.startsWith(`file://`)&&(t=`file://${t}`),T.IN_NODE_ESM){let e=await Promise.resolve().then(()=>c(l(),1));return(await Promise.resolve().then(()=>c(l(),1))).fileURLToPath(e.dirname(t))}let n=t.lastIndexOf(F);if(n===-1)throw Error(`Could not extract indexURL path from pyodide module location. Please pass the indexURL explicitly to loadPyodide.`);return t.slice(0,n)}d(W,`calculateDirname`);function ae(e){return e.substring(0,e.lastIndexOf(`/`)+1)||globalThis.location?.toString()||`.`}d(ae,`calculateInstallBaseUrl`);function G(e){let t=e.FS,n=e.FS.filesystems.MEMFS,r=e.PATH,i={DIR_MODE:16895,FILE_MODE:33279,mount:d(function(e){if(!e.opts.fileSystemHandle)throw Error(`opts.fileSystemHandle is required`);return n.mount.apply(null,arguments)},`mount`),syncfs:d(async(e,t,n)=>{try{let r=i.getLocalSet(e),a=await i.getRemoteSet(e),o=t?a:r,s=t?r:a;await i.reconcile(e,o,s),n(null)}catch(e){n(e)}},`syncfs`),getLocalSet:d(e=>{let n=Object.create(null);function i(e){return e!==`.`&&e!==`..`}d(i,`isRealDir`);function a(e){return t=>r.join2(e,t)}d(a,`toAbsolute`);let o=t.readdir(e.mountpoint).filter(i).map(a(e.mountpoint));for(;o.length;){let e=o.pop(),r=t.stat(e);t.isDir(r.mode)&&o.push.apply(o,t.readdir(e).filter(i).map(a(e))),n[e]={timestamp:r.mtime,mode:r.mode}}return{type:`local`,entries:n}},`getLocalSet`),getRemoteSet:d(async e=>{let t=Object.create(null),n=await oe(e.opts.fileSystemHandle);for(let[a,o]of n)a!==`.`&&(t[r.join2(e.mountpoint,a)]={timestamp:o.kind===`file`?new Date((await o.getFile()).lastModified):new Date,mode:o.kind===`file`?i.FILE_MODE:i.DIR_MODE});return{type:`remote`,entries:t,handles:n}},`getRemoteSet`),loadLocalEntry:d(e=>{let r=t.lookupPath(e,{}).node,i=t.stat(e);if(t.isDir(i.mode))return{timestamp:i.mtime,mode:i.mode};if(t.isFile(i.mode))return r.contents=n.getFileDataAsTypedArray(r),{timestamp:i.mtime,mode:i.mode,contents:r.contents};throw Error(`node type not supported`)},`loadLocalEntry`),storeLocalEntry:d((e,n)=>{if(t.isDir(n.mode))t.mkdirTree(e,n.mode);else if(t.isFile(n.mode))t.writeFile(e,n.contents,{canOwn:!0});else throw Error(`node type not supported`);t.chmod(e,n.mode),t.utime(e,n.timestamp,n.timestamp)},`storeLocalEntry`),removeLocalEntry:d(e=>{var n=t.stat(e);t.isDir(n.mode)?t.rmdir(e):t.isFile(n.mode)&&t.unlink(e)},`removeLocalEntry`),loadRemoteEntry:d(async e=>{if(e.kind===`file`){let t=await e.getFile();return{contents:new Uint8Array(await t.arrayBuffer()),mode:i.FILE_MODE,timestamp:new Date(t.lastModified)}}else{if(e.kind===`directory`)return{mode:i.DIR_MODE,timestamp:new Date};throw Error(`unknown kind: `+e.kind)}},`loadRemoteEntry`),storeRemoteEntry:d(async(e,n,i)=>{let a=e.get(r.dirname(n)),o=t.isFile(i.mode)?await a.getFileHandle(r.basename(n),{create:!0}):await a.getDirectoryHandle(r.basename(n),{create:!0});if(o.kind===`file`){let e=await o.createWritable();await e.write(i.contents),await e.close()}e.set(n,o)},`storeRemoteEntry`),removeRemoteEntry:d(async(e,t)=>{await e.get(r.dirname(t)).removeEntry(r.basename(t)),e.delete(t)},`removeRemoteEntry`),reconcile:d(async(e,n,a)=>{let o=0,s=[];Object.keys(n.entries).forEach(function(e){let r=n.entries[e],i=a.entries[e];(!i||t.isFile(r.mode)&&r.timestamp.getTime()>i.timestamp.getTime())&&(s.push(e),o++)}),s.sort();let c=[];if(Object.keys(a.entries).forEach(function(e){n.entries[e]||(c.push(e),o++)}),c.sort().reverse(),!o)return;let l=n.type===`remote`?n.handles:a.handles;for(let t of s){let n=r.normalize(t.replace(e.mountpoint,`/`)).substring(1);if(a.type===`local`){let e=l.get(n),r=await i.loadRemoteEntry(e);i.storeLocalEntry(t,r)}else{let e=i.loadLocalEntry(t);await i.storeRemoteEntry(l,n,e)}}for(let t of c)if(a.type===`local`)i.removeLocalEntry(t);else{let n=r.normalize(t.replace(e.mountpoint,`/`)).substring(1);await i.removeRemoteEntry(l,n)}},`reconcile`)};e.FS.filesystems.NATIVEFS_ASYNC=i}d(G,`initializeNativeFS`);var oe=d(async e=>{let t=[];async function n(e){for await(let r of e.values())t.push(r),r.kind===`directory`&&await n(r)}d(n,`collect`),await n(e);let r=new Map;r.set(`.`,e);for(let n of t){let t=(await e.resolve(n)).join(`/`);r.set(t,n)}return r},`getFsHandles`),se=te(`AGFzbQEAAAABDANfAGAAAW9gAW8BfwMDAgECByECD2NyZWF0ZV9zZW50aW5lbAAAC2lzX3NlbnRpbmVsAAEKEwIHAPsBAPsbCwkAIAD7GvsUAAs=`),ce=async function(){if(!(globalThis.navigator&&(/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform===`MacIntel`&&typeof navigator.maxTouchPoints<`u`&&navigator.maxTouchPoints>1)))try{let e=await WebAssembly.compile(se);return await WebAssembly.instantiate(e)}catch(e){if(e instanceof WebAssembly.CompileError)return;throw e}}();async function K(){let e=await ce;if(e)return e.exports;let t=Symbol(`error marker`);return{create_sentinel:d(()=>t,`create_sentinel`),is_sentinel:d(e=>e===t,`is_sentinel`)}}d(K,`getSentinelImport`);function q(e){let t={config:e,runtimeEnv:T},n={noImageDecoding:!0,noAudioDecoding:!0,noWasmDecoding:!1,preRun:fe(e),print:e.stdout,printErr:e.stderr,onExit(e){n.exitCode=e},thisProgram:e._sysExecutable,arguments:e.args,API:t,locateFile:d(t=>e.indexURL+t,`locateFile`),instantiateWasm:pe(e.indexURL)};return n}d(q,`createSettings`);function J(e){return function(t){try{t.FS.mkdirTree(e)}catch(t){console.error(`Error occurred while making a home directory '${e}':`),console.error(t),console.error(`Using '/' for a home directory instead`),e=`/`}t.FS.chdir(e)}}d(J,`createHomeDirectory`);function Y(e){return function(t){Object.assign(t.ENV,e)}}d(Y,`setEnvironment`);function le(e){return e?[async t=>{t.addRunDependency(`fsInitHook`);try{await e(t.FS,{sitePackages:t.API.sitePackages})}finally{t.removeRunDependency(`fsInitHook`)}}]:[]}d(le,`callFsInitHook`);function ue(e){let t=e.HEAPU32[e._Py_Version>>>2];return[t>>>24&255,t>>>16&255,t>>>8&255]}d(ue,`computeVersionTuple`);function de(e){let t=B(e);return async e=>{e.API.pyVersionTuple=ue(e);let[n,r]=e.API.pyVersionTuple;e.FS.mkdirTree(`/lib`),e.API.sitePackages=`/lib/python${n}.${r}/site-packages`,e.FS.mkdirTree(e.API.sitePackages),e.addRunDependency(`install-stdlib`);try{let i=await t;e.FS.writeFile(`/lib/python${n}${r}.zip`,i)}catch(e){console.error(`Error occurred while installing the standard library:`),console.error(e)}finally{e.removeRunDependency(`install-stdlib`)}}}d(de,`installStdlib`);function fe(e){let t;return t=e.stdLibURL==null?e.indexURL+`python_stdlib.zip`:e.stdLibURL,[de(t),J(e.env.HOME),Y(e.env),G,...le(e.fsInit)]}d(fe,`getFileSystemInitializationFuncs`);function pe(e){if(typeof WasmOffsetConverter<`u`)return;let{binary:t,response:n}=z(e+`pyodide.asm.wasm`),r=K();return function(e,i){return async function(){e.sentinel=await r;try{let r;r=n?await WebAssembly.instantiateStreaming(n,e):await WebAssembly.instantiate(await t,e);let{instance:a,module:o}=r;i(a,o)}catch(e){console.warn(`wasm instantiation failed!`),console.warn(e)}}(),{}}}d(pe,`getInstantiateWasmFunc`);var me=`0.29.4`;function X(e){return e===void 0||e.endsWith(`/`)?e:e+`/`}d(X,`withTrailingSlash`);var he=me;async function ge(e={}){if(await j(),e.lockFileContents&&e.lockFileURL)throw Error(`Can't pass both lockFileContents and lockFileURL`);let t=e.indexURL||await W();if(t=X(P(t)),e.packageBaseUrl=X(e.packageBaseUrl),e.cdnUrl=X(e.packageBaseUrl??`https://cdn.jsdelivr.net/pyodide/v0.29.4/full/`),!e.lockFileContents){let n=e.lockFileURL??t+`pyodide-lock.json`;e.lockFileContents=U(n),e.packageBaseUrl??=ae(n)}e.indexURL=t,e.packageCacheDir&&=X(P(e.packageCacheDir));let n={fullStdLib:!1,jsglobals:globalThis,stdin:globalThis.prompt?()=>globalThis.prompt():void 0,args:[],env:{},packages:[],packageCacheDir:e.packageBaseUrl,enableRunUntilComplete:!0,checkAPIVersion:!0,BUILD_ID:`9ad695efc6a269d9e0a764721c629a728308ddb40e060fe4513bb5c162585079`},r=Object.assign(n,e);return r.env.HOME??=`/home/pyodide`,r.env.PYTHONINSPECT??=`1`,r}d(ge,`initializeConfiguration`);function _e(e){let t=q(e),n=t.API;return n.lockFilePromise=Promise.resolve(e.lockFileContents),t}d(_e,`createEmscriptenSettings`);async function ve(e){if(typeof _createPyodideModule!=`function`){let t=`${e.indexURL}pyodide.asm.js`;await V(t)}}d(ve,`loadWasmScript`);async function ye(e,t){if(!e._loadSnapshot)return;let n=await e._loadSnapshot,r=ArrayBuffer.isView(n)?n:new Uint8Array(n);return t.noInitialRun=!0,t.INITIAL_MEMORY=r.length,r}d(ye,`prepareSnapshot`);async function be(e){let t=await _createPyodideModule(e);if(e.exitCode!==void 0)throw new t.ExitStatus(e.exitCode);return t}d(be,`createPyodideModule`);function xe(e,t){let n=e.API;if(t.pyproxyToStringRepr&&n.setPyProxyToStringMethod(!0),t.convertNullToNone&&n.setCompatNullToNone(!0),t.toJsLiteralMap&&n.setCompatToJsLiteralMap(!0),n.version!==`0.29.4`&&t.checkAPIVersion)throw Error(`Pyodide version does not match: '${he}' <==> '${n.version}'. If you updated the Pyodide version, make sure you also updated the 'indexURL' parameter passed to loadPyodide.`);e.locateFile=e=>{throw e.endsWith(`.so`)?Error(`Failed to find dynamic library "${e}"`):Error(`Unexpected call to locateFile("${e}")`)}}d(xe,`configureAPI`);function Se(e,t,n){let r=e.API,i;return t&&(i=r.restoreSnapshot(t)),r.finalizeBootstrap(i,n._snapshotDeserializer)}d(Se,`bootstrapPyodide`);async function Ce(e,t){let n=e._api;return n.sys.path.insert(0,``),n._pyodide.set_excepthook(),await n.packageIndexReady,n.initializeStreams(t.stdin,t.stdout,t.stderr),e}d(Ce,`finalizeSetup`);async function we(e={}){let t=await ge(e),n=_e(t);await ve(t);let r=await ye(t,n),i=await be(n);return xe(i,t),await Ce(Se(i,r,t),t)}d(we,`loadPyodide`);let Z=null,Q=null,$=async()=>{if(Z)return;self.postMessage({type:`PROGRESS`,stage:`Downloading base environment...`}),Z=await we({indexURL:`https://cdn.jsdelivr.net/pyodide/v0.29.4/full/`}),self.postMessage({type:`PROGRESS`,stage:`Installing document processor (pymupdf)...`}),await Z.loadPackage(`micropip`);let e=Z.pyimport(`micropip`);await e.install(`pymupdf`),await e.install(`python-docx`),self.postMessage({type:`PROGRESS`,stage:`Setting up...`})};self.onmessage=async e=>{let{type:t,code:n,jobId:r,pdfBytes:i,redactions:a,pageNum:o}=e.data;try{if(t===`INIT`)Q||=$(),await Q,self.postMessage({type:`READY`,jobId:r});else if(t===`RUN_CODE`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!n)throw Error(`No code provided`);let e=await Z.runPythonAsync(n);self.postMessage({type:`RESULT`,jobId:r,result:e})}else if(t===`EXTRACT_TEXT`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`doc_bytes`,i);let e=await Z.runPythonAsync(`
import fitz
doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
text = ""
for page in doc:
    text += page.get_text() + " "
doc.close()
text
      `);self.postMessage({type:`RESULT`,jobId:r,result:e})}else if(t===`EXTRACT_ALL_PAGES_TEXT`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);let{pageCount:t}=e.data;if(!t)throw Error(`No pageCount provided`);Z.globals.set(`doc_bytes`,i),Z.globals.set(`page_count`,t);let n=await Z.runPythonAsync(`
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
texts = []
for i in range(min(page_count, len(doc))):
    page_text = doc[i].get_text()
    texts.append(page_text)
doc.close()
del doc_bytes
del page_count
json.dumps(texts)
      `),a=JSON.parse(n);self.postMessage({type:`RESULT`,jobId:r,result:a})}else if(t===`EXTRACT_PAGE_TEXT`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);if(o===void 0)throw Error(`No pageNum provided`);Z.globals.set(`doc_bytes`,i),Z.globals.set(`target_page`,o);let e=await Z.runPythonAsync(`
import fitz
doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
text = ""
if target_page < len(doc):
    text = doc[target_page].get_text()
doc.close()
del doc_bytes
del target_page
text
      `);self.postMessage({type:`RESULT`,jobId:r,result:e})}else if(t===`REDACT_DOCUMENT`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);if(!a)throw Error(`No redactions provided`);Z.globals.set(`doc_bytes`,i),Z.globals.set(`redactions`,a);let e=(await Z.runPythonAsync(`
import fitz
doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
strings_to_redact = redactions.to_py()
for page in doc:
    for t in strings_to_redact:
        rl = page.search_for(t)
        for r in rl:
            page.add_redact_annot(r, fill=(0, 0, 0))
    page.apply_redactions()
out_bytes = doc.tobytes()
doc.close()
bytes(out_bytes)
      `)).toJs(),t=new Uint8Array(e);self.postMessage({type:`RESULT`,jobId:r,result:t})}else if(t===`HIGHLIGHT_DOCUMENT`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);let{highlights:t}=e.data;if(!t)throw Error(`No highlights provided`);Z.globals.set(`doc_bytes`,i),Z.globals.set(`highlights`,t);let n=(await Z.runPythonAsync(`
import fitz
doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
strings_to_highlight = highlights.to_py()
for page in doc:
    for t in strings_to_highlight:
        rl = page.search_for(t)
        for r in rl:
            page.add_highlight_annot(r)
out_bytes = doc.tobytes()
doc.close()
bytes(out_bytes)
      `)).toJs(),a=new Uint8Array(n);self.postMessage({type:`RESULT`,jobId:r,result:a})}else if(t===`DIFF_HIGHLIGHT_DOCUMENT`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);let{highlights:t,color:n}=e.data;if(!t)throw Error(`No highlights provided`);let a=n||[1,1,0];Z.globals.set(`doc_bytes`,i),Z.globals.set(`highlights`,t),Z.globals.set(`color`,a);let o=await Z.runPythonAsync(`
import fitz
doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
strings_to_highlight = highlights.to_py()
c = color.to_py()

for page in doc:
    for text_block in strings_to_highlight:
        if not text_block.strip():
            continue
        # Split by newline to handle strings that span across multiple lines in PDF text extraction
        for t in text_block.split('\\n'):
            if not t.strip():
                continue
            rl = page.search_for(t.strip())
            for r in rl:
                annot = page.add_highlight_annot(r)
                annot.set_colors(stroke=(c[0], c[1], c[2]))
                annot.update()
out_bytes = doc.tobytes()
doc.close()
bytes(out_bytes)
      `),s=o.toJs(),c=new Uint8Array(s);o.destroy(),self.postMessage({type:`RESULT`,jobId:r,result:c})}else if(t===`DIFF_MERGED_HIGHLIGHT_DOCUMENT`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);let{pdfBytes2:t,removedHighlights:n,addedHighlights:a}=e.data;if(!t)throw Error(`Second PDF bytes not provided`);if(!n||!a)throw Error(`Missing highlights arrays`);Z.globals.set(`doc1_bytes`,i),Z.globals.set(`doc2_bytes`,t);let o=await Z.runPythonAsync(`
import fitz
import zipfile
import io
import difflib
import hashlib

doc1 = fitz.open(stream=bytes(doc1_bytes), filetype="pdf")
doc2 = fitz.open(stream=bytes(doc2_bytes), filetype="pdf")

word_to_id = {}
def get_token_id(w):
    w_norm = w.strip().lower()
    w_norm = w_norm.replace('“', '"').replace('”', '"').replace('‘', "'").replace('’', "'")
    w_norm = w_norm.replace('—', '-').replace('–', '-')
    if w_norm not in word_to_id:
        word_to_id[w_norm] = len(word_to_id)
    return word_to_id[w_norm]

def get_block_hash(block_words):
    text = "".join(w[0].strip().lower() for w in block_words)
    return hashlib.md5(text.encode('utf-8')).hexdigest()

def extract_blocks(doc):
    blocks = []
    for page in doc:
        current_block_no = -1
        current_block = []
        for w in page.get_text("words"):
            block_no = w[5]
            if block_no != current_block_no:
                if current_block:
                    blocks.append(current_block)
                current_block = []
                current_block_no = block_no
            current_block.append((w[4], fitz.Rect(w[:4]), page))
        if current_block:
            blocks.append(current_block)
    return blocks

blocks1 = extract_blocks(doc1)
blocks2 = extract_blocks(doc2)

hashes1 = [get_block_hash(b) for b in blocks1]
hashes2 = [get_block_hash(b) for b in blocks2]

block_matcher = difflib.SequenceMatcher(None, hashes1, hashes2)

for b_tag, bi1, bi2, bj1, bj2 in block_matcher.get_opcodes():
    if b_tag == 'equal':
        continue

    chunk1_words = []
    chunk1_rects = []
    for b in blocks1[bi1:bi2]:
        for w, rect, page in b:
            chunk1_words.append(get_token_id(w))
            chunk1_rects.append((page, rect))

    chunk2_words = []
    chunk2_rects = []
    for b in blocks2[bj1:bj2]:
        for w, rect, page in b:
            chunk2_words.append(get_token_id(w))
            chunk2_rects.append((page, rect))

    word_matcher = difflib.SequenceMatcher(None, chunk1_words, chunk2_words)
    for tag, i1, i2, j1, j2 in word_matcher.get_opcodes():
        if tag in ('delete', 'replace'):
            for idx in range(i1, i2):
                page, rect = chunk1_rects[idx]
                annot = page.add_highlight_annot(rect)
                annot.set_colors(stroke=(1, 0.5, 0.5))
                annot.update()
        if tag in ('insert', 'replace'):
            for idx in range(j1, j2):
                page, rect = chunk2_rects[idx]
                annot = page.add_highlight_annot(rect)
                annot.set_colors(stroke=(0.5, 1, 0.5))
                annot.update()

zip_buffer = io.BytesIO()
with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
    zip_file.writestr('original_removed.pdf', doc1.tobytes())
    zip_file.writestr('updated_added.pdf', doc2.tobytes())

doc1.close()
doc2.close()
del doc1_bytes
del doc2_bytes
bytes(zip_buffer.getvalue())
      `),s=o.toJs(),c=new Uint8Array(s);o.destroy(),self.postMessage({type:`RESULT`,jobId:r,result:c})}else if(t===`ENCRYPT_DOCUMENT`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);let t=e.data.password;if(!t)throw Error(`No password provided`);Z.globals.set(`doc_bytes`,i),Z.globals.set(`password`,t);let n=(await Z.runPythonAsync(`
import fitz
doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
out_bytes = doc.write(encryption=fitz.PDF_ENCRYPT_AES_256, user_pw=password, owner_pw=password, permissions=fitz.PDF_PERM_PRINT)
doc.close()
bytes(out_bytes)
      `)).toJs(),a=new Uint8Array(n);self.postMessage({type:`RESULT`,jobId:r,result:a})}else if(t===`UNLOCK_DOCUMENT`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);let t=e.data.password;if(!t)throw Error(`No password provided`);Z.globals.set(`doc_bytes`,i),Z.globals.set(`password`,t);let n=(await Z.runPythonAsync(`
import fitz
doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
authenticated = doc.authenticate(password)
if not authenticated:
    raise Exception("Incorrect password")
out_bytes = doc.write(encryption=fitz.PDF_ENCRYPT_NONE)
doc.close()
del doc_bytes
bytes(out_bytes)
      `)).toJs(),a=new Uint8Array(n);self.postMessage({type:`RESULT`,jobId:r,result:a})}else if(t===`AUDIT_DOCUMENT`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`doc_bytes`,i);let e=await Z.runPythonAsync(`
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")

fake_redactions = []
for page_num, page in enumerate(doc):
    text_blocks = page.get_text("blocks")
    drawings = page.get_drawings()

    for d in drawings:
        fill_color = d.get("fill")
        if fill_color is not None:
            rect_d = fitz.Rect(d["rect"])
            for b in text_blocks:
                text_content = b[4].strip()
                if not text_content:
                    continue
                rect_b = fitz.Rect(b[:4])
                intersection = rect_d & rect_b

                if not intersection.is_empty and intersection.get_area() > 0.5 * rect_b.get_area():
                    fake_redactions.append({
                        "page": page_num + 1,
                        "text": text_content
                    })

doc.close()
json.dumps(fake_redactions)
      `),t=JSON.parse(e);self.postMessage({type:`RESULT`,jobId:r,result:t})}else if(t===`SANITIZE_DOCUMENT`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`doc_bytes`,i);let e=(await Z.runPythonAsync(`
import fitz

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")

# 1. Strip metadata
doc.set_metadata({})

# 2. Check fake redactions & 3. Flatten annotations
fake_redactions_found = 0
for page in doc:
    text_blocks = page.get_text("blocks")
    drawings = page.get_drawings()

    for d in drawings:
        fill_color = d.get("fill")
        if fill_color is not None:
            rect_d = fitz.Rect(d["rect"])
            for b in text_blocks:
                if not b[4].strip():
                    continue
                rect_b = fitz.Rect(b[:4])
                intersection = rect_d & rect_b

                if not intersection.is_empty and intersection.get_area() > 0.5 * rect_b.get_area():
                    fake_redactions_found += 1
                    break

    while page.first_annot:
        page.delete_annot(page.first_annot)

out_bytes = doc.write(garbage=4)
doc.close()

[fake_redactions_found, bytes(out_bytes)]
      `)).toJs(),t=e[0],n=new Uint8Array(e[1]);self.postMessage({type:`RESULT`,jobId:r,result:{fakeRedactions:t,bytes:n}})}else if(t===`EXTRACT_TABLES`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`doc_bytes`,i),await Z.pyimport(`micropip`).install(`pandas`);let e=await Z.runPythonAsync(`
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
all_tables = []
for page_num, page in enumerate(doc):
    tables = page.find_tables()
    for table_idx, table in enumerate(tables.tables):
        # get pandas df, but convert to list of dicts directly
        try:
            import micropip
            import asyncio
            # lazily install pandas if not present
            try:
                import pandas as pd
            except ImportError:
                pass

            df = table.to_pandas()
            # replace NaNs with None to ensure valid JSON
            df = df.where(pd.notnull(df), None)

            # format columns to be strings to avoid issue with numeric headers
            df.columns = df.columns.astype(str)
            table_data = df.to_dict(orient="records")

            all_tables.append({
                "page": page_num + 1,
                "table_index": table_idx + 1,
                "data": table_data,
                "columns": list(df.columns)
            })
        except Exception as e:
            print("Error processing table:", e)
            pass

doc.close()
json.dumps(all_tables)
      `);self.postMessage({type:`RESULT`,jobId:r,result:e})}else if(t===`CSV_TO_EXCEL`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);let{csvData:t}=e.data;if(!t)throw Error(`No JSON data provided`);let n=Z.pyimport(`micropip`);await n.install(`pandas`),await n.install(`openpyxl`),Z.globals.set(`json_str`,t);let i=(await Z.runPythonAsync(`
import pandas as pd
import io
import json

tables = json.loads(json_str)

excel_buf = io.BytesIO()
with pd.ExcelWriter(excel_buf, engine='openpyxl') as writer:
    if not tables:
        # Create empty df just to have a valid excel file
        pd.DataFrame().to_excel(writer, index=False, sheet_name="Empty")
    else:
        for i, table in enumerate(tables):
            sheet_name = f"Page_{table['page']}_Table_{table['table_index']}"
            # limit sheet name to 31 chars (excel limit)
            sheet_name = sheet_name[:31]

            df = pd.DataFrame(table['data'], columns=table['columns'])
            df.to_excel(writer, index=False, sheet_name=sheet_name)

excel_bytes = excel_buf.getvalue()
bytes(excel_bytes)
      `)).toJs(),a=new Uint8Array(i);self.postMessage({type:`RESULT`,jobId:r,result:a})}else if(t===`EXTRACT_IMAGES`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`doc_bytes`,i);let e=await Z.runPythonAsync(`
import fitz
import io
import zipfile

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
zip_buffer = io.BytesIO()

with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
    for page_num in range(len(doc)):
        page = doc[page_num]
        image_list = page.get_images(full=True)
        for img_index, img in enumerate(image_list):
            xref = img[0]
            try:
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                image_name = f"page{page_num+1}_img{img_index+1}.{image_ext}"
                zip_file.writestr(image_name, image_bytes)
            except Exception:
                pass

zip_bytes = zip_buffer.getvalue()
doc.close()
del doc, zip_buffer, doc_bytes
zip_bytes
`),t=e.toJs();e.destroy(),self.postMessage({type:`RESULT`,jobId:r,result:t})}else if(t===`EXTRACT_BOOKMARKS`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`doc_bytes`,i);let e=await Z.runPythonAsync(`
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
toc = doc.get_toc()
doc.close()
del doc, doc_bytes

formatted_toc = [{"level": item[0], "title": item[1], "page": item[2]} for item in toc]
json.dumps(formatted_toc)
`);self.postMessage({type:`RESULT`,jobId:r,result:e})}else if(t===`EDIT_BOOKMARKS`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);let t=(e.data.bookmarks||[]).map(e=>[e.level,e.title,e.page]);Z.globals.set(`doc_bytes`,i),Z.globals.set(`toc_data`,t);let n=await Z.runPythonAsync(`
import fitz

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
# Convert JS proxy list to python list of lists
py_toc = [[item[0], item[1], item[2]] for item in toc_data]
doc.set_toc(py_toc)

out_bytes = doc.tobytes()
doc.close()
del doc, doc_bytes, toc_data
out_bytes
`),a=n.toJs();n.destroy(),self.postMessage({type:`RESULT`,jobId:r,result:a})}else if(t===`EXTRACT_LINKS`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`doc_bytes`,i);let e=await Z.runPythonAsync(`
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
links = []

for page_num in range(len(doc)):
    page = doc[page_num]
    page_links = page.get_links()
    for link in page_links:
        if "uri" in link:
            links.append({
                "page": page_num + 1,
                "uri": link["uri"]
            })

doc.close()
del doc, doc_bytes
json.dumps(links)
`);self.postMessage({type:`RESULT`,jobId:r,result:e})}else if(t===`EXTRACT_METADATA`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`doc_bytes`,i);let e=await Z.runPythonAsync(`
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
metadata = {
    "standard": doc.metadata,
    "xmp": doc.get_xml_metadata()
}
doc.close()
del doc, doc_bytes
json.dumps(metadata)
`);self.postMessage({type:`RESULT`,jobId:r,result:e})}else if(t===`EDIT_METADATA`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);let{metadata:t}=e.data;if(!t)throw Error(`No metadata provided`);Z.globals.set(`doc_bytes`,i),Z.globals.set(`metadata_str`,JSON.stringify(t));let n=(await Z.runPythonAsync(`
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
metadata_dict = json.loads(metadata_str)

if "standard" in metadata_dict:
    doc.set_metadata(metadata_dict["standard"])
if "xmp" in metadata_dict:
    doc.set_xml_metadata(metadata_dict["xmp"])

out_bytes = doc.tobytes()
doc.close()
del doc, doc_bytes
bytes(out_bytes)
`)).toJs(),a=new Uint8Array(n);self.postMessage({type:`RESULT`,jobId:r,result:a})}else if(t===`EXTRACT_ANNOTATIONS`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`doc_bytes`,i);let e=await Z.runPythonAsync(`
import fitz
import json

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
annotations = []

for page_num in range(len(doc)):
    page = doc[page_num]
    for annot in page.annots():
        info = annot.info
        content = info.get("content", "")
        if not content:
            # Fallback to extracting the underlying text
            content = page.get_text("text", clip=annot.rect).strip()

        if content:
            annotations.append({
                "page": page_num + 1,
                "type": annot.type[1],
                "content": content
            })

doc.close()
del doc, doc_bytes
json.dumps(annotations)
`);self.postMessage({type:`RESULT`,jobId:r,result:e})}else if(t===`EXTRACT_HTML`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`doc_bytes`,i);let e=await Z.runPythonAsync(`
import fitz

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
html_lines = []

for page in doc:
    html_lines.append(page.get_text("html"))

doc.close()
"\\n<hr>\\n".join(html_lines)
      `);self.postMessage({type:`RESULT`,jobId:r,result:e})}else if(t===`EXTRACT_MARKDOWN`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`doc_bytes`,i);let e=await Z.runPythonAsync(`
import fitz

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
markdown_lines = []

for page in doc:
    blocks_dict = page.get_text("dict").get("blocks", [])

    for block in blocks_dict:
        if block.get("type") == 0:  # text block
            block_text = []
            max_font_size = 0

            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    if not text:
                        continue
                    font_size = span.get("size", 0)
                    if font_size > max_font_size:
                        max_font_size = font_size
                    block_text.append(text)

            combined_text = " ".join(block_text).strip()
            if not combined_text:
                continue

            # Simple heuristic for headings
            if max_font_size > 20:
                markdown_lines.append(f"# {combined_text}")
            elif max_font_size > 16:
                markdown_lines.append(f"## {combined_text}")
            elif max_font_size > 14:
                markdown_lines.append(f"### {combined_text}")
            else:
                markdown_lines.append(combined_text)

            markdown_lines.append("") # add empty line after block

doc.close()
"\\n".join(markdown_lines)
      `);self.postMessage({type:`RESULT`,jobId:r,result:e})}else if(t===`DOCX_TO_PDF`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No DOCX bytes provided`);Z.globals.set(`doc_bytes`,i);let e=(await Z.runPythonAsync(`
import fitz
doc_fitz = fitz.open(stream=bytes(doc_bytes), filetype="docx")
pdf_bytes = doc_fitz.convert_to_pdf()
doc_fitz.close()
del doc_bytes
bytes(pdf_bytes)
      `)).toJs(),t=new Uint8Array(e);self.postMessage({type:`RESULT`,jobId:r,result:t})}else if(t===`VERIFY_SIGNATURE`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`pdf_bytes`,i);let e=await Z.runPythonAsync(`
import fitz
import json

def verify_signature(pdf_bytes):
    doc = fitz.open("pdf", bytes(pdf_bytes))

    signatures = []
    has_signatures = False

    for page in doc:
        for widget in page.widgets():
            if widget.field_type == fitz.PDF_WIDGET_TYPE_SIGNATURE:
                has_signatures = True
                signatures.append({
                    "field_name": widget.field_name,
                    "is_signed": bool(widget.field_value)
                })

    doc.close()
    return json.dumps({
        "has_signatures": has_signatures,
        "signatures": signatures
    })

verify_signature(pdf_bytes)
`),t=JSON.parse(e);self.postMessage({type:`RESULT`,jobId:r,result:t})}else if(t===`EXPORT_DARK`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`doc_bytes`,i);let e=(await Z.runPythonAsync(`
import fitz
import re

def invert_colors(match):
    parts = match.group(0).split()
    op = parts[-1]
    try:
        if op in (b'g', b'G'):
            val = float(parts[0])
            if val < 0.5: return b"0.85 " + op
        elif op in (b'rg', b'RG'):
            r, g, b = float(parts[0]), float(parts[1]), float(parts[2])
            lum = 0.299*r + 0.587*g + 0.114*b
            if lum < 0.5:
                return f"{1.0-r:.3g} {1.0-g:.3g} {1.0-b:.3g} ".encode() + op
    except Exception:
        pass
    return match.group(0)

doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")

for page in doc:
    page.clean_contents()
    for xref in page.get_contents():
        stream = doc.xref_stream(xref)
        if not stream: continue
        stream = re.sub(rb'\\b([0-9.]+)\\s+([gG])\\b', invert_colors, stream)
        stream = re.sub(rb'\\b([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\s+([rR]g)\\b', invert_colors, stream)
        doc.update_stream(xref, stream)
    page.draw_rect(page.rect, color=(0.12, 0.12, 0.12), fill=(0.12, 0.12, 0.12), overlay=False)

    for img in page.get_images(full=True):
        xref = img[0]
        try:
            pix = fitz.Pixmap(doc, xref)
            if pix.n - pix.alpha < 3:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            pix.gamma_with(1.5)
            page.replace_image(xref, pixmap=pix)
        except Exception:
            pass

out_bytes = doc.tobytes()
doc.close()
del doc_bytes
bytes(out_bytes)
`)).toJs(),t=new Uint8Array(e);self.postMessage({type:`RESULT`,jobId:r,result:t})}else if(t===`PDF_TO_DOCX`){if(Q||=$(),await Q,!Z)throw Error(`Pyodide not initialized`);if(!i)throw Error(`No PDF bytes provided`);Z.globals.set(`doc_bytes`,i);let e=(await Z.runPythonAsync(`
import fitz, docx, io
pdf_doc = fitz.open(stream=bytes(doc_bytes), filetype="pdf")
docx_doc = docx.Document()
for page in pdf_doc:
    text = page.get_text()
    if text:
        docx_doc.add_paragraph(text)
pdf_doc.close()
buf = io.BytesIO()
docx_doc.save(buf)
del doc_bytes
bytes(buf.getvalue())
      `)).toJs(),t=new Uint8Array(e);self.postMessage({type:`RESULT`,jobId:r,result:t})}}catch(e){self.postMessage({type:`ERROR`,jobId:r,error:e.message})}}})();