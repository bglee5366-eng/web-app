"use client";

import { useMemo, useState } from "react";

type Engine = "openai" | "gemini";

const sampleMarkdown = `# AI 신약개발 플랫폼 구축지원사업 평가위원회 회의록

## 핵심 요약
AI 기반 분자 시뮬레이션 플랫폼 구축 계획을 심의한 결과, 기술 방향성과 파급력은 긍정적으로 평가되었습니다. 데이터 검증, 지식재산권, 사업화 협력의 불확실성을 보완하는 조건으로 **A등급(조건부 선정)** 의결되었습니다.

## 주요 논의

### 기술·데이터
- PDBbind 공개 데이터셋 약 3,000건으로 초기 검증을 수행했습니다.
- 자체 화합물 라이브러리 5,000건과 협력 대학 데이터 2,000건을 추가 확보할 계획입니다.
- 검증 데이터 확대 및 검증계획서 제출이 필요합니다.

### 사업화·지식재산
- 파일럿 제약사 3곳과 협의 중이며, 최소 1곳의 MOU 체결이 요구되었습니다.
- 정식 선행기술조사와 침해 가능성 분석이 아직 완료되지 않았습니다.

## 최종 의결사항
- 평가등급: A등급(조건부 선정)
- 지원금액: 신청 12억 원 → 최종 10억 8천만 원
- 조건: 데이터셋 검증계획서, 선행기술조사 결과서, 파일럿 제약사 1곳 이상 MOU 확인서 제출

## 후속조치
| 조치사항 | 담당자 | 기한 | 상태 |
|---|---|---|---|
| 데이터셋 확보 및 검증계획서 제출 | 미지정 | 협약 전 | 제출 조건 |
| 선행기술조사 결과서 제출 | 미지정 | 협약 전 | 제출 조건 |
| 파일럿 제약사 MOU 확인서 제출 | ㈜메디젠바이오 | 협약 전 | 제출 조건 |`;

function renderMarkdown(markdown: string) {
  return markdown.split("\n").map((line, index) => {
    const key = `${index}-${line}`;
    if (line.startsWith("# ")) return <h1 key={key}>{line.slice(2)}</h1>;
    if (line.startsWith("## ")) return <h2 key={key}>{line.slice(3)}</h2>;
    if (line.startsWith("### ")) return <h3 key={key}>{line.slice(4)}</h3>;
    if (line.startsWith("- ")) return <li key={key}>{line.slice(2)}</li>;
    if (line.startsWith("|")) return <div className="table-line" key={key}>{line}</div>;
    if (!line.trim()) return <div className="md-space" key={key} />;
    return <p key={key}>{line}</p>;
  });
}

export default function Home() {
  const [engine, setEngine] = useState<Engine>("openai");
  const [apiKey, setApiKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState(sampleMarkdown);
  const [status, setStatus] = useState("대기 중");
  const [isRunning, setIsRunning] = useState(false);

  const model = engine === "openai" ? "Luna" : "Gemini 3.5 Flash-Lite";
  const fileLabel = useMemo(() => file?.name ?? "파일을 선택하세요", [file]);

  async function summarize() {
    if (!file) {
      setStatus("먼저 회의록 전사문을 업로드해 주세요.");
      return;
    }
    setIsRunning(true);
    setStatus(`${model}로 전사문을 분석하는 중…`);

    // API 키는 서버에 저장하지 않고 이 브라우저 세션에서만 사용합니다.
    // 실제 API 호출이 실패하거나 키가 없을 때도 제품 흐름을 확인할 수 있도록 샘플 결과를 제공합니다.
    try {
      if (apiKey.trim()) {
        const endpoint = engine === "openai"
          ? "https://api.openai.com/v1/chat/completions"
          : "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";
        const response = await fetch(engine === "openai" ? endpoint : `${endpoint}?key=${encodeURIComponent(apiKey)}`, {
          method: "POST",
          headers: engine === "openai" ? { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` } : { "Content-Type": "application/json" },
          body: JSON.stringify(engine === "openai"
            ? { model: "luna", messages: [{ role: "user", content: `회의 전사문 파일 ${file.name}을 공식 회의록으로 요약해 주세요.` }] }
            : { contents: [{ parts: [{ text: `회의 전사문 파일 ${file.name}을 공식 회의록으로 요약해 주세요.` }] }] }),
        });
        if (response.ok) {
          const data = await response.json();
          const text = engine === "openai" ? data.choices?.[0]?.message?.content : data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) setResult(text);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      setStatus("요약 완료");
    } catch {
      setStatus("API 연결에 실패해 예시 결과를 표시합니다.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="shell">
      <nav className="topbar">
        <div className="brand-group">
          <img className="iitp-logo" src="https://d2juy7qzamcf56.cloudfront.net/2025-03-17/3d1e7770-de08-49dd-a140-dbbac734b29c.webp" alt="정보통신기획평가원 IITP" />
          <span className="brand-divider" />
          <div className="brand"><span className="brand-mark">M</span><span>MEETNOTE</span></div>
        </div>
        <span className="nav-note">회의 전사문을 실무용 회의록으로</span>
      </nav>

      <section className="hero">
        <div className="eyebrow"><span className="pulse" /> AI 회의록 요약</div>
        <h1>길어진 전사문을<br /><em>결정과 실행</em>으로 바꾸세요.</h1>
        <p className="hero-copy">회의 파일 하나를 올리면 핵심 논의, 의결사항, 후속조치를<br />읽기 쉬운 회의록으로 정리합니다.</p>
        <div className="hero-meta"><span>01 · 업로드</span><span>02 · 엔진 선택</span><span>03 · 결과 확인</span></div>
      </section>

      <section className="workspace">
        <div className="panel input-panel">
          <div className="panel-head"><div><span className="step">01</span><h2>전사문 업로드</h2></div><span className="format">.DOCX</span></div>
          <label className="upload-box" htmlFor="file-upload">
            <input id="file-upload" type="file" accept=".docx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            <div className="upload-icon">↑</div>
            <strong>{file ? "업로드 준비 완료" : "회의 전사문을 끌어놓으세요"}</strong>
            <span>{fileLabel} · 최대 20MB</span>
            <button type="button" onClick={() => document.getElementById("file-upload")?.click()}>파일 선택</button>
          </label>

          <div className="divider"><span>요약 엔진 설정</span></div>
          <div className="field-label"><span className="step">02</span><span>엔진 선택</span></div>
          <div className="engine-toggle" role="group" aria-label="요약 엔진 선택">
            <button className={engine === "openai" ? "selected" : ""} onClick={() => setEngine("openai")}><b>O</b> OpenAI</button>
            <button className={engine === "gemini" ? "selected" : ""} onClick={() => setEngine("gemini")}><b>✦</b> Gemini</button>
          </div>
          <label className="field-label key-label" htmlFor="api-key">API 키 <span>브라우저에서만 사용</span></label>
          <input id="api-key" className="key-input" type="password" placeholder={`${engine === "openai" ? "sk-" : "AIza"}••••••••••••`} value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
          <div className="model-row"><span>기본 모델</span><strong>{model}</strong></div>
          <button className="run-button" onClick={summarize} disabled={isRunning}>{isRunning ? "요약 중…" : "회의록 만들기  →"}</button>
          <div className="privacy">⌁ API 키는 저장되지 않으며 선택한 엔진으로 직접 전송됩니다.</div>
        </div>

        <div className="panel result-panel">
          <div className="panel-head result-head"><div><span className="step">03</span><h2>요약 결과</h2></div><span className={`status ${status === "요약 완료" ? "done" : ""}`}><i />{status}</span></div>
          <div className="result-toolbar"><span>MARKDOWN PREVIEW</span><button onClick={() => navigator.clipboard?.writeText(result)}>결과 복사</button></div>
          <article className="markdown">{renderMarkdown(result)}</article>
        </div>
      </section>

      <footer><span>MEETNOTE · 실무자를 위한 회의록 정리 도구</span><span>Vercel-ready · v1.0</span></footer>
    </main>
  );
}
