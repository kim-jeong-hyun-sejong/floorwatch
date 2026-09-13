"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, Camera, CircleStop, ExternalLink } from "lucide-react";
import type { ObjectDetector } from "@mediapipe/tasks-vision";

const valid = (key: string | null) => !!key && /^[a-f0-9]{32}$/.test(key);

export default function CameraPage() {
  const [room, setRoom] = useState("");
  const [floor, setFloor] = useState(1);
  const [phase, setPhase] = useState<"idle" | "loading" | "running">("idle");
  const [count, setCount] = useState<number | null>(null);
  const [message, setMessage] = useState("층을 선택하고 웹캠 연결을 누르세요.");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<ObjectDetector | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const runRef = useRef(false);

  useEffect(() => {
    const query = new URLSearchParams(location.search).get("room");
    const previous = localStorage.getItem("floorwatch-room");
    const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, "0")).join("");
    const key = valid(query) ? query! : valid(previous) ? previous! : random;
    localStorage.setItem("floorwatch-room", key);
    history.replaceState(null, "", "/camera?room=" + key);
    setRoom(key);
    return () => {
      runRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      detectorRef.current?.close();
    };
  }, []);

  function stop() {
    runRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setPhase("idle");
    setCount(null);
    setMessage("웹캠이 중지되었습니다. 마지막 감지 결과는 12초 후 ‘연결 없음’으로 바뀝니다.");
  }

  async function start() {
    if (!room || phase !== "idle") return;
    setPhase("loading");
    setMessage("웹캠과 사람 감지 모델을 준비 중입니다. 처음에는 몇 초 걸릴 수 있습니다.");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Error("이 브라우저에서 웹캠을 사용할 수 없습니다. HTTPS 주소와 카메라 권한을 확인하세요.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) throw Error("영상 화면을 준비하지 못했습니다.");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const { FilesetResolver, ObjectDetector } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe-wasm");
      const detector = await ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/efficientdet_lite0_uint8.tflite" },
        runningMode: "VIDEO",
        scoreThreshold: 0.45,
        categoryAllowlist: ["person"],
      });
      if (!streamRef.current) { detector.close(); return; }
      detectorRef.current = detector;
      runRef.current = true;
      setPhase("running");
      setMessage(`${floor}층 카메라 실행 중 · 화면에서 감지한 사람 수를 2초마다 전송합니다.`);
      const tick = async () => {
        const video = videoRef.current, canvas = canvasRef.current;
        if (!runRef.current || !video || !canvas || video.readyState < 2 || busyRef.current) return;
        busyRef.current = true;
        try {
          const detections = detector.detectForVideo(video, performance.now()).detections;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.lineWidth = Math.max(2, canvas.width / 220);
            ctx.strokeStyle = "#55e0a5";
            detections.forEach(d => { if (d.boundingBox) ctx.strokeRect(d.boundingBox.originX, d.boundingBox.originY, d.boundingBox.width, d.boundingBox.height); });
          }
          const people = detections.length;
          setCount(people);
          const response = await fetch("/api/floors", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room, floor, count: people }),
          });
          if (!response.ok) throw Error("서버에 결과를 보내지 못했습니다. 사이트 접근 권한을 확인하세요.");
          setMessage(`${floor}층 카메라 실행 중 · 마지막 신호 전송 완료`);
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "감지 또는 전송 중 오류가 발생했습니다.");
        } finally { busyRef.current = false; }
      };
      void tick();
      timerRef.current = setInterval(() => void tick(), 2000);
    } catch (err) {
      stop();
      setMessage(err instanceof Error ? err.message : "웹캠 연결에 실패했습니다.");
    }
  }

  return <main className="camera-shell">
    <header className="top"><div className="logo"><Activity size={25}/><div><b>FLOOR<span>WATCH</span></b><small>웹캠 사람 감지 · 송신 화면</small></div></div><a className="camera-top-link" href={room ? "/?room=" + room : "/"} target="_blank" rel="noopener noreferrer">현황 화면 열기 <ExternalLink size={16}/></a></header>
    <section className="camera-main"><p className="overline">CAMERA INPUT / A동</p><h1>이 컴퓨터의 웹캠 연결</h1><p>각 컴퓨터에서 같은 현황 링크를 열고, 담당 층만 다르게 선택하세요. 원본 영상은 이 브라우저에서만 처리합니다.</p>
      <div className="camera-grid"><div className="preview-card"><div className="preview-heading"><Camera size={18}/> 웹캠 미리보기 <span>{phase === "running" ? "● 실행 중" : phase === "loading" ? "준비 중" : "대기 중"}</span></div><div className="video-frame"><video ref={videoRef} muted playsInline autoPlay/><canvas ref={canvasRef}/>{phase === "idle" && <div className="camera-placeholder"><Camera size={46}/><span>연결 후 이곳에 웹캠 영상이 표시됩니다.</span></div>}</div><div className="camera-status" role="status">{message}</div></div>
      <aside className="camera-control"><label htmlFor="camera-floor">이 컴퓨터가 맡을 층</label><select id="camera-floor" disabled={phase !== "idle"} value={floor} onChange={e => setFloor(Number(e.target.value))}><option value={1}>1층 · CAM-01</option><option value={2}>2층 · CAM-02</option><option value={3}>3층 · CAM-03</option></select><button className="camera-start" disabled={phase !== "idle" || !room} onClick={() => void start()}>{phase === "loading" ? "모델 불러오는 중…" : "웹캠 연결 및 사람 감지 시작"}</button><button className="camera-stop" disabled={phase !== "running"} onClick={stop}><CircleStop size={17}/> 중지</button><div className="camera-result"><span>현재 영상 속 사람 검출</span><strong>{count === null ? "—" : count}<small>명</small></strong></div><p className="camera-note">검출 대상은 ‘사람’이며 작업자 여부는 구분하지 않습니다. 이 탭을 닫으면 웹캠 감지도 멈춥니다. 12초간 신호가 없으면 현황 화면에서 ‘연결 없음’이 됩니다.</p></aside></div>
    </section>
  </main>;
}
