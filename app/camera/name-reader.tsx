"use client";
import {useEffect,useRef,useState,type RefObject} from 'react';

type Worker={recognize:(image:HTMLCanvasElement)=>Promise<{data:{text:string;confidence:number}}>;terminate:()=>Promise<unknown>};
type Engine={createWorker:(lang:string)=>Promise<Worker>};

function threeHangulCandidates(text:string):string[]{
 const normalized=text.normalize('NFC');
 const candidates:string[]=[];

 // 공백이나 문장부호로 구분된 정확히 세 글자의 한글 낱말을 찾습니다.
 for(const token of normalized.match(/[가-힣]+/g)??[]){
  if(token.length===3)candidates.push(token);
 }

 // OCR가 "홍 길 동"처럼 글자 사이를 띄운 경우, 한 줄 전체가 세 글자이면 복원합니다.
 for(const line of normalized.split(/\r?\n/)){
  const hangulOnly=line.replace(/[^가-힣]/g,'');
  if(hangulOnly.length===3)candidates.push(hangulOnly);
 }

 return [...new Set(candidates)].slice(0,20);
}

export default function NameReader({video,count,onNames}:{video:RefObject<HTMLVideoElement|null>;count:number|null;onNames:(names:string[])=>void}){
 const [enabled,setEnabled]=useState(false),[status,setStatus]=useState('꺼짐 · 전체 화면에서 한글 세 글자 후보를 찾습니다.');
 const callback=useRef(onNames),people=useRef(count);callback.current=onNames;people.current=count;
 const preview=useRef<HTMLCanvasElement>(null);

 useEffect(()=>{
  if(!enabled){callback.current([]);setStatus('꺼짐 · 전체 화면에서 한글 세 글자 후보를 찾습니다.');return;}
  let stopped=false,worker:Worker|null=null,timer:ReturnType<typeof setTimeout>|null=null,previous='';

  async function run(){
   try{
    let engine=(window as Window & {Tesseract?:Engine}).Tesseract;
    if(!engine){
     await new Promise<void>((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      script.onload=()=>resolve();
      script.onerror=()=>{script.remove();reject(Error('OCR 다운로드 실패'));};
      document.head.appendChild(script);
     });
     engine=(window as Window & {Tesseract?:Engine}).Tesseract;
    }
    if(stopped)return;
    if(!engine)throw Error('OCR 준비 실패');
    setStatus('한국어 OCR 모델 준비 중…');
    worker=await engine.createWorker('kor');
    if(stopped){await worker.terminate();return;}

    async function tick(){
     if(stopped||!worker)return;
     const v=video.current,canvas=preview.current;
     if(!people.current||people.current<1||!v||v.readyState<2||!canvas){
      previous='';callback.current([]);
      setStatus('사람이 감지되면 전체 화면 OCR을 시작합니다.');
     }else{
      const w=v.videoWidth,h=v.videoHeight;
      const targetWidth=Math.min(1280,w);
      const targetHeight=Math.max(1,Math.round(h*(targetWidth/w)));
      canvas.width=targetWidth;canvas.height=targetHeight;
      const ctx=canvas.getContext('2d')!;
      ctx.drawImage(v,0,0,w,h,0,0,targetWidth,targetHeight);
      setStatus('전체 화면의 한글을 판독 중…');
      const result=await worker.recognize(canvas);
      if(stopped)return;
      const candidates=result.data.confidence>=45?threeHangulCandidates(result.data.text):[];
      const key=candidates.slice().sort().join('|');
      if(candidates.length>0){
       if(previous===key){
        callback.current(candidates);
        setStatus('반복 판독된 한글 세 글자 후보: '+candidates.join(', ')+' · 이름 확정 아님');
       }else{
        setStatus('세 글자 후보 재확인 중: '+candidates.join(', '));
       }
       previous=key;
      }else{
       previous='';callback.current([]);
       setStatus('한글 세 글자 후보 없음 · 글자를 더 크게, 밝고 수평으로 보여주세요.');
      }
     }
     if(!stopped)timer=setTimeout(()=>void tick().catch(()=>{
      callback.current([]);setStatus('OCR 오류 · 껐다 켜서 다시 시도하세요.');
     }),3000);
    }
    void tick().catch(()=>{callback.current([]);setStatus('OCR 실행 실패 · 사람 수 감지는 계속됩니다.');});
   }catch{
    if(!stopped)setStatus('OCR 모델 준비 실패 · 인터넷 연결을 확인하세요.');
   }
  }

  void run();
  return()=>{stopped=true;if(timer)clearTimeout(timer);void worker?.terminate();callback.current([]);};
 },[enabled,video]);

 return <section className="ocr-panel">
  <h3>전체 화면 한글 OCR · 실험</h3>
  <p>웹캠 전체 화면의 텍스트를 읽고 한글 세 글자 문자열을 자동 추출합니다. 세 글자라는 조건만으로 실제 사람 이름임을 확인할 수는 없습니다.</p>
  <label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> 전체 화면 OCR 켜기</label>
  <canvas ref={preview} className="ocr-preview"/>
  <p role="status">{status}</p>
  <small>원본 영상과 OCR 이미지는 서버로 전송하지 않습니다. 반복 판독된 세 글자 후보만 현황 화면에 전송됩니다. 작은 글씨·곡면·기울어진 글씨는 인식되지 않을 수 있습니다.</small>
 </section>;
}
