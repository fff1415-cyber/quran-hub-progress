const fs = require('node:fs');
const ts = require('typescript');
function load(path, deps, source = fs.readFileSync(path, 'utf8')) {
  const exports = {};
  const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require', 'exports', code)(name => { if (!(name in deps)) throw Error(`Unexpected dependency ${name}`); return deps[name]; }, exports);
  return exports;
}
function storage() { const data = new Map(); return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)}; }
function deferred() { let resolve,reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; }
const flush = async () => { for(let i=0;i<12;i++) await Promise.resolve(); };
function hooks() {
  const state=[],refs=[],effects=[]; let cursor=0;
  const react={
    useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},
    useRef(initial){const i=cursor++;return refs[i]??(refs[i]={current:initial});},
    useEffect(fn,deps){const i=cursor++;if(!effects[i]||!deps||deps.some((d,j)=>d!==effects[i].deps?.[j]))effects[i]={fn,deps,pending:true,cleanup:effects[i]?.cleanup};},
    useCallback(fn){cursor++;return fn;},useMemo(fn){cursor++;return fn();},createContext:()=>({Provider:'provider'}),useContext:()=>null,
  };
  return {react,state,refs,render(fn){cursor=0;return fn();},effects(){for(const e of effects)if(e?.pending){e.cleanup?.();e.cleanup=e.fn();e.pending=false;}},cleanup(){for(const e of effects)e?.cleanup?.();}};
}
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
function find(node,predicate) { if(!node)return [];if(Array.isArray(node))return node.flatMap(value=>find(value,predicate));if(typeof node!=='object')return [];return [...(predicate(node)?[node]:[]),...find(node.props?.children,predicate)]; }
function text(node){if(Array.isArray(node))return node.map(text).join('');if(node==null||typeof node==='boolean')return '';if(typeof node==='object')return text(node.props?.children);return String(node);}
module.exports={load,storage,deferred,flush,hooks,jsx,find,text};
