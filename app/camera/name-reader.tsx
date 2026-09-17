"use client";
import {useEffect,useRef,useState,type RefObject} from 'react';
import {normalizeNames} from '../signal';
type Worker={recognize:(image:HTMLCanvasElement)=>Promise<{data:{text:string;confidence:number}}>;terminate:()=>Promise<unknown>};
type Engine={createWorker:(lang:string)=>Promise<Worker>};
export default function NameReader({video,count,onNames}:{video:RefObject<HTMLVideoElement|null>;count:number|null;onNames:(names:string[])=>void}){
 const [enabled,setEnabled]=useState(false),[roster,setRoster]=useState(''),[top,setTop]=useState(20),[status,setStatus]=useState('꺼짐 · 동의받은 가명으로 시험하세요.');
 const callback=useRef(onNames),people=useRef(count);callback.current=onNames;people.current=count;
 const preview=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
 if(!enabled){callback.current([]);return;}
 let stopped=false,worker:Worker|null=null,timer:ReturnType<typeof setTimeout>|null=null,previous='';
 const allowed=normalizeNames(roster.split(/[,\s]+/));
 async function run(){
 try{
 let engine=(window as Window & {Tesseract?:Engine}).Tesseract;
 if(!engine){await new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';script.onload=()=>resolve();script.onerror=()=>{script.remove();reject(Error('OCR 다운로드 실패'));};document.head.appendChild(script);});engine=(window as Window & {Tesseract?:Engine}).Tesseract;}
 if(stopped)return;
 if(!engine)throw Error('OCR 준비 실패');
 setStatus('한국어 OCR 모델 준비 중…');
 worker=await engine.createWorker('kor');
 if(stopped){await worker.terminate();return;}
 async function tick(){
 if(stopped||!worker)return;
 callback.current([]);
 const v=video.current,canvas=preview.current;
 if(people.current!==1||!v||v.readyState<2||!canvas){previous='';setStatus('OCR 시연은 한 명만 화면에 들어오세요.');}
 else{
 const w=v.videoWidth,h=v.videoHeight;
 canvas.width=900;canvas.height=180;
 const ctx=canvas.getContext('2d')!;
 ctx.drawImage(v,w*.2,h*top/100,w*.6,h*.12,0,0,900,180);
 const result=await worker.recognize(canvas);
 if(stopped)return;
 const compact=result.data.text.normalize('NFC').replace(/\s/g,'');
 const match=allowed.filter(n=>compact===n);
 if(result.data.confidence>=70&&match.length===1&&people.current===1){
 const name=match[0];
 if(previous===name){callback.current([name]);setStatus('반복 판독 일치: '+name+' · 신원 확인 아님');}else setStatus('이름 후보 재확인 중…');
 previous=name;
 }else{previous='';setStatus('판독 불확실 · 이름표를 중앙 영역에 크게 맞추세요.');}
 }
 if(!stopped)timer=setTimeout(()=>void tick().catch(()=>{callback.current([]);setStatus('OCR 오류 · 껐다 켜서 다시 시도하세요.');}),2500);
 }
 void tick().catch(()=>{callback.current([]);setStatus('OCR 실행 실패 · 사람 수 감지는 계속됩니다.');});
 }catch{if(!stopped)setStatus('OCR 모델 준비 실패 · 인터넷 연결을 확인하세요.');}
 }
 void run();
 return()=>{stopped=true;if(timer)clearTimeout(timer);void worker?.terminate();callback.current([]);};
 },[enabled,roster,top,video]);
 return <section className="ocr-panel"><h3>한글 이름표 OCR · 실험</h3><p>안전모 착용 여부는 자동 판정하지 않습니다. 한 명의 큰 이름표를 읽는 제한된 시연 기능입니다.</p><label>허용할 가명 목록 (쉼표 구분)<input value={roster} disabled={enabled} onChange={e=>setRoster(e.target.value)} placeholder="홍길동, 김가람"/></label><label>판독 영역 높이: {top}%<input type="range" min="0" max="85" value={top} disabled={enabled} onChange={e=>setTop(Number(e.target.value))}/></label><p>영상 가로 20~80%, 위에서 {top}~{top+12}% 영역을 읽습니다. 아래 잘린 영상에 이름표 전체가 보이도록 위치를 맞추세요.</p><label><input type="checkbox" checked={enabled} disabled={!enabled&&normalizeNames(roster.split(/[,\s]+/)).length===0} onChange={e=>setEnabled(e.target.checked)}/> 동의받은 가명 사용 · OCR 켜기</label><canvas ref={preview} className="ocr-preview"/><p role="status">{status}</p><small>모델은 외부 CDN에서 내려받고 영상 판독은 브라우저에서 처리합니다. 판독된 가명은 현황 링크 보유자에게 공개되며 서버에 마지막 결과로 저장됩니다.</small></section>;
}
