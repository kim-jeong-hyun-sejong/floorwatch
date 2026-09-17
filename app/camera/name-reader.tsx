"use client";

import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

type Worker = {
  recognize: (
    image: HTMLCanvasElement
  ) => Promise<{
    data: {
      text: string;
      confidence: number;
    };
  }>;
  terminate: () => Promise<unknown>;
};

type Engine = {
  createWorker: (lang: string) => Promise<Worker>;
};

/**
 * OCR 결과에서 한글 3글자 후보를 추출합니다.
 *
 * 예:
 * 김정현   -> 김정현
 * 김 정 현 -> 김정현
 *
 * 단, 한글 3글자라고 해서 실제 사람 이름이라고 확정하는 것은 아닙니다.
 */
function threeHangulCandidates(text: string): string[] {
  const normalized = text.normalize("NFC");

  const candidates: string[] = [];

  // 1. OCR 결과에서 연속된 한글 문자열 찾기
  const words = normalized.match(/[가-힣]+/g) ?? [];

  for (const word of words) {
    if (word.length === 3) {
      candidates.push(word);
    }
  }

  // 2. "김 정 현"처럼 띄어서 읽힌 경우 복원
  for (const line of normalized.split(/\r?\n/)) {
    const hangulOnly = line.replace(/[^가-힣]/g, "");

    if (hangulOnly.length === 3) {
      candidates.push(hangulOnly);
    }
  }

  // 중복 제거
  return [...new Set(candidates)].slice(0, 20);
}

export default function NameReader({
  video,
  count,
  onNames,
}: {
  video: RefObject<HTMLVideoElement | null>;
  count: number | null;
  onNames: (names: string[]) => void;
}) {
  const [enabled, setEnabled] = useState(false);

  const [status, setStatus] = useState(
    "꺼짐 · 전체 화면에서 한글 세 글자 후보를 찾습니다."
  );

  const callback = useRef(onNames);
  const people = useRef(count);

  callback.current = onNames;
  people.current = count;

  const preview = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled) {
      callback.current([]);

      setStatus(
        "꺼짐 · 전체 화면에서 한글 세 글자 후보를 찾습니다."
      );

      return;
    }

    let stopped = false;

    let worker: Worker | null = null;

    let timer: ReturnType<typeof setTimeout> | null = null;

    async function run() {
      try {
        let engine = (
          window as Window & {
            Tesseract?: Engine;
          }
        ).Tesseract;

        /**
         * Tesseract.js가 아직 없다면 CDN에서 불러옵니다.
         */
        if (!engine) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");

            script.src =
              "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

            script.onload = () => resolve();

            script.onerror = () => {
              script.remove();

              reject(
                new Error("OCR 라이브러리 다운로드 실패")
              );
            };

            document.head.appendChild(script);
          });

          engine = (
            window as Window & {
              Tesseract?: Engine;
            }
          ).Tesseract;
        }

        if (stopped) {
          return;
        }

        if (!engine) {
          throw new Error("OCR 엔진 준비 실패");
        }

        setStatus("한국어 OCR 모델 준비 중…");

        /**
         * 한국어 OCR 모델 생성
         */
        worker = await engine.createWorker("kor");

        if (stopped) {
          await worker.terminate();
          return;
        }

        async function tick() {
          if (stopped || !worker) {
            return;
          }

          const v = video.current;
          const canvas = preview.current;

          /**
           * 사람이 없으면 OCR 실행하지 않음
           */
          if (
            !people.current ||
            people.current < 1 ||
            !v ||
            v.readyState < 2 ||
            !canvas
          ) {
            callback.current([]);

            setStatus(
              "사람이 감지되면 전체 화면 OCR을 시작합니다."
            );
          } else {
            const w = v.videoWidth;
            const h = v.videoHeight;

            if (w <= 0 || h <= 0) {
              setStatus("카메라 영상을 준비 중입니다.");
            } else {
              /**
               * 너무 큰 영상을 그대로 OCR하면 느리므로
               * 최대 너비를 1280px로 제한합니다.
               */
              const targetWidth = Math.min(1280, w);

              const targetHeight = Math.max(
                1,
                Math.round(
                  h * (targetWidth / w)
                )
              );

              canvas.width = targetWidth;
              canvas.height = targetHeight;

              const ctx = canvas.getContext("2d");

              if (!ctx) {
                throw new Error(
                  "Canvas context 생성 실패"
                );
              }

              /**
               * 웹캠 전체 화면을 canvas에 복사
               */
              ctx.drawImage(
                v,
                0,
                0,
                w,
                h,
                0,
                0,
                targetWidth,
                targetHeight
              );

              setStatus(
                "전체 화면의 한글을 판독 중…"
              );

              /**
               * OCR 실행
               */
              const result =
                await worker.recognize(canvas);

              if (stopped) {
                return;
              }

              const rawText =
                result.data.text
                  .replace(/\s+/g, " ")
                  .trim();

              const confidence =
                Math.round(
                  result.data.confidence
                );

              /**
               * 중요:
               * 예전처럼 confidence >= 45 조건을 걸지 않습니다.
               *
               * OCR이 한글 3글자를 읽었다면
               * 신뢰도와 관계없이 일단 후보로 확인합니다.
               */
              const candidates =
                threeHangulCandidates(
                  result.data.text
                );

              if (candidates.length > 0) {
                /**
                 * 현재는 테스트 단계이므로
                 * 한 번 읽혀도 바로 메인 화면으로 전달합니다.
                 */
                callback.current(candidates);

                setStatus(
                  "OCR 원문: " +
                    (rawText || "(비어 있음)") +
                    " / 신뢰도: " +
                    confidence +
                    "% / 후보: " +
                    candidates.join(", ")
                );
              } else {
                callback.current([]);

                setStatus(
                  "OCR 원문: " +
                    (rawText || "(비어 있음)") +
                    " / 신뢰도: " +
                    confidence +
                    "% / 한글 세 글자 후보 없음"
                );
              }
            }
          }

          /**
           * 약 3초 후 다시 OCR
           */
          if (!stopped) {
            timer = setTimeout(() => {
              void tick().catch(() => {
                callback.current([]);

                setStatus(
                  "OCR 오류 · 껐다 켜서 다시 시도하세요."
                );
              });
            }, 3000);
          }
        }

        void tick().catch(() => {
          callback.current([]);

          setStatus(
            "OCR 실행 실패 · 사람 수 감지는 계속됩니다."
          );
        });
      } catch {
        if (!stopped) {
          callback.current([]);

          setStatus(
            "OCR 모델 준비 실패 · 인터넷 연결을 확인하세요."
          );
        }
      }
    }

    void run();

    return () => {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
      }

      void worker?.terminate();

      callback.current([]);
    };
  }, [enabled, video]);

  return (
    <section className="ocr-panel">
      <h3>전체 화면 한글 OCR · 실험</h3>

      <p>
        웹캠 전체 화면의 텍스트를 읽고
        한글 세 글자 문자열을 자동 추출합니다.
        세 글자라는 조건만으로 실제 사람 이름이라고
        확정하지는 않습니다.
      </p>

      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) =>
            setEnabled(e.target.checked)
          }
        />

        {" "}전체 화면 OCR 켜기
      </label>

      <canvas
        ref={preview}
        className="ocr-preview"
      />

      <p role="status">
        {status}
      </p>

      <small>
        원본 영상과 OCR 이미지는 서버로
        전송하지 않습니다. OCR 결과에서 추출한
        한글 세 글자 후보만 현황 화면으로
        전달됩니다. 작은 글씨, 흔들린 글씨,
        곡면의 글씨, 기울어진 글씨는
        인식률이 낮을 수 있습니다.
      </small>
    </section>
  );
}
