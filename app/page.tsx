"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Camera, Copy, Radio, Users } from "lucide-react";
type Floor = { floor: number; count: number; updatedAt: number | null; state: "active" | "empty" | "offline" };
const blank: Floor[] = [3, 2, 1].map(floor => ({ floor, count: 0, updatedAt: null, state: "offline" }));

export default function Home() {
  const [room, setRoom] = useState("");
  const [floors, setFloors] = useState(blank);
  const [selected, setSelected] = useState(1);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showTools, setShowTools] = useState(false);
  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get("room");
    const previous = localStorage.getItem("floorwatch-room");
    const generated = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, "0")).join("");
    const valid = (s: string | null) => !!s && /^[a-f0-9]{32}$/.test(s);
    const value = valid(fromUrl) ? fromUrl! : valid(previous) ? previous! : generated;
    localStorage.setItem("floorwatch-room", value);
    setRoom(value);
  }, []);
  const refresh = useCallback(async () => {
    if (!room) return;
    try {
      const res = await fetch("/api/floors?room=" + room, { cache: "no-store" });
      if (!res.ok) throw Error();
      const data = await res.json() as { floors: Floor[] };
      setFloors(data.floors);
      setError("");
    } catch { setError("서버 연결에 실패했습니다. 잠시 후 다시 확인하세요."); }
  }, [room]);
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 2000);
    return () => clearInterval(interval);
  }, [refresh]);
  useEffect(() => {
    if (!room) return;
    const modelContext = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const controller = new AbortController();
    void Promise.resolve(modelContext.registerTool({
      name: "simulate_floor_detection",
      title: "층별 감지 시연",
      description: "선택한 층의 감지 인원을 수동 시연 신호로 전송하고 현황을 갱신합니다.",
      inputSchema: { type: "object", properties: { floor: { type: "integer", enum: [1, 2, 3] }, count: { type: "integer", minimum: 0, maximum: 20 } }, required: ["floor", "count"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input: unknown) {
        const value = input as { floor?: number; count?: number };
        if (![1, 2, 3].includes(value.floor ?? -1) || !Number.isInteger(value.count) || (value.count ?? -1) < 0 || (value.count ?? 21) > 20) throw Error("잘못된 층 또는 인원입니다.");
        const response = await fetch("/api/floors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room, floor: value.floor, count: value.count }) });
        if (!response.ok) throw Error("감지 신호를 전송하지 못했습니다.");
        await refresh();
        return { floor: value.floor, count: value.count, source: "manual_simulation" };
      },
    }, { signal: controller.signal })).catch(() => {});
    return () => controller.abort();
  }, [room, refresh]);
  async function send(floor: number, count: number) {
    if (busy || !room) return;
    setBusy(true);
    try {
      const res = await fetch("/api/floors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room, floor, count }) });
      if (!res.ok) throw Error();
      await refresh();
    } catch { setError("감지 신호를 전송하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(location.origin + "/?room=" + room); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("링크를 복사하지 못했습니다."); }
  }
  const active = floors.filter(f => f.state === "active");
  const current = floors.find(f => f.floor === selected) ?? blank[2];
  const label = (f: Floor) => f.state === "active" ? `${f.count}명 감지` : f.state === "empty" ? "감지 없음" : "연결 없음";
  return <main className="shell">
    <header className="top"><div className="logo"><Activity size={25}/><div><b>FLOOR<span>WATCH</span></b><small>A동 · 층별 관제</small></div></div><div className="header-actions"><span className="sync"><i/>2초 간격 갱신</span><button className="header-button" onClick={() => void copy()} disabled={!room}><Copy size={16}/>{copied ? "복사됨" : "현황 링크 복사"}</button><button className="header-button subtle" aria-expanded={showTools} onClick={() => setShowTools(!showTools)}>{showTools ? "테스트 닫기" : "수동 테스트"}</button></div></header>
    <div className={`layout ${showTools ? "has-tools" : ""}`}>
      <section>
        <div className="intro"><p className="overline">A동 / 3개 층</p><h1>층별 사람 감지 현황</h1><p>각 층 카메라에서 최근 수신한 사람 감지 결과입니다.</p><a className="camera-link" href={room ? "/camera?room=" + room : "/camera"}>웹캠 연결하기 →</a></div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="metrics"><div><small>현재 감지 인원</small><strong>{active.reduce((a,f) => a + f.count,0)}<em>명</em></strong><span>최근 수신 결과의 합계</span></div><div><small>사람 감지 층</small><strong>{active.length}<em> / 3층</em></strong><span>12초 이내 수신</span></div><div><small>카메라 연결</small><strong>{floors.filter(f => f.state !== "offline").length}<em> / 3대</em></strong><span>12초 초과 시 연결 없음</span></div></div>
        <div className="content"><div className="building-card"><div className="building-caption">BUILDING A <span>FLOOR SECTION</span></div><div className="roof"/><div className="building">{floors.map(f => <button key={f.floor} aria-pressed={selected === f.floor} onClick={() => setSelected(f.floor)} className={`floor ${f.state} ${selected === f.floor ? "selected" : ""}`}><b>0{f.floor}F</b><span className="windows"><i/><i/><i/></span><span className="floor-status"><i/>{label(f)}</span></button>)}</div><p>A동 · 층별 개념 단면도</p></div>
        <div className="detail"><p className="overline">선택한 층</p><div className="detail-title"><h2>{selected}층 상세 현황</h2><span className={current.state}>{current.state === "active" ? "사람 감지" : label(current)}</span></div><div className="count"><Users size={28}/><strong>{current.state === "active" ? current.count : "—"}</strong>명</div><dl><div><dt>카메라</dt><dd>CAM-0{selected}</dd></div><div><dt>마지막 수신</dt><dd>{current.updatedAt ? new Date(current.updatedAt).toLocaleTimeString("ko-KR") : "기록 없음"}</dd></div></dl><p className="note"><Radio size={18}/> 이 수치는 한 장면에서 감지한 사람 수입니다. 출입 인원이나 개별 작업자 수를 뜻하지 않습니다.</p></div></div>
      </section>
      {showTools && <aside className="controls"><p className="overline">TEST SIGNAL</p><h2>수동 테스트</h2><p>웹캠이 없어도 층별 표시를 시험할 수 있습니다.</p><div className="simulators">{[3,2,1].map(f => <div className="sim" key={f}><div><Camera size={17}/><b>{f}층 카메라</b></div><div className="buttons">{[1,2,0].map(n => <button disabled={busy} onClick={() => void send(f,n)} key={n}>{n}명</button>)}</div></div>)}</div><p className="explain">이 버튼은 실제 영상 분석 결과가 아닙니다. 새 신호가 12초간 없으면 ‘연결 없음’으로 바뀝니다.</p></aside>}
    </div>
  </main>;
}
