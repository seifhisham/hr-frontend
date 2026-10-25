import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function component(file,overrides=[],calls=[]){
 const code=ts.transpileModule(readFileSync(new URL('../app/components/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 let index=0;const jsx=(type,props)=>({type,props});const api={save:async(...args)=>{calls.push(args);return [];},api:async()=>[]};
 const context={exports:{},Intl,FormData:class{get(name){return name==='reason'?'Administrator reviewed responsibilities':null;}},require:name=>name==='react'?{useState:initial=>[overrides[index++]??initial,()=>{}],useEffect:()=>{}}:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='../../lib/api'?api:{}};
 vm.runInNewContext(code,context);return context.exports;
}
function nodes(tree){const result=[];function visit(node){if(Array.isArray(node)){node.forEach(visit);return;}if(!node||typeof node!=='object')return;result.push(node);visit(node.props?.children);}visit(tree);return result;}
const branch={id:'branch-a',code:'main',name:'Main',active:true,latitude:30,longitude:31,radiusMeters:50,trackingRadiusMeters:150,trackingGraceMinutes:5};
const props={branches:[branch],employees:[],company:{name:'Company',timezone:'Africa/Cairo'},today:'2026-10-15',refresh:async()=>{},onError:error=>{throw error;}};
test('branch administration controls are hidden from HR while permitted branches remain visible',()=>{
 const admin=nodes(component('branches.tsx').Branches({...props,role:'admin'}));
 const hr=nodes(component('branches.tsx').Branches({...props,role:'hr'}));
 assert.ok(admin.some(node=>node.type==='button'&&node.props.children==='Add branch'));
 assert.ok(!hr.some(node=>node.type==='button'&&node.props.children==='Add branch'));
 assert.ok(hr.some(node=>node.type==='td'&&node.props.children==='Main'));
 assert.ok(!hr.some(node=>node.type==='select'));
});
test('saving HR permissions sends only the selected branches and audit reason',async()=>{
 const calls=[];const rendered=component('branches.tsx',[null,[],'hr-account',['branch-a']],calls);
 const tree=nodes(rendered.Branches({...props,role:'admin'}));const form=tree.find(node=>node.type==='form');
 await form.props.onSubmit({preventDefault(){},currentTarget:{}});
 assert.equal(calls[0][0],'/hr-accounts/hr-account/branches');assert.equal(calls[0][1],'PATCH');
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])),{branchIds:['branch-a'],reason:'Administrator reviewed responsibilities'});
});
test('only company administrators see payroll approval controls',()=>{
 const run={month:'2026-10',status:'draft',rows:[],revision:'reviewed',timezone:'Africa/Cairo'};
 const state=['2026-10',null,null,0,{month:'2026-10',revision:0,version:0,run},null];
 for(const canApprove of [false,true]){
  const tree=nodes(component('payroll.tsx',state).Payroll({today:'2026-10-15',revision:0,canApprove,onError:()=>{}}));
  assert.equal(tree.some(node=>node.type==='button'&&node.props.children==='Approve and lock month'),canApprove);
 }
});
