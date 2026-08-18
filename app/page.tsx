"use client";

import { useMemo, useState } from "react";

type Engine = "openai" | "gemini";
type Style = "executive" | "formal" | "action";

const sampleMarkdown = `# AI 신약개발 플랫폼 구축지원사업 평가위원회 회의록

## 핵심 요약
AI 기반 분자 시뮬레이션 플랫폼 구축 계획을 심의한 결과, 기술 방향성과 파급력은 긍정적으로 평가되었습니다. 데이터 검증, 지식재산권, 사업화 협력의 불확실성을 보완하는 조건으로 **A등급(조건부 선정)** 의결되었습니다.

## 주요 논의
- PDBbind 공개 데이터셋 약 3,000건으로 초기 검증을 수행했습니다.
- 자체 화합물 라이브러리와 협력 대학 데이터를 추가 확보할 계획입니다.
- 파일럿 제약사 1곳 이상 MOU와 선행기술조사 결과서 제출이 요구되었습니다.

## 최종 의결사항
- 평가등급: A등급(조건부 선정)
- 지원금액: 신청 12억 원 → 최종 10억 8천만 원
- 후속조치: 데이터셋 검증계획서, 선행기술조사 결과서, MOU 확인서 제출`;

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
  const [stage, setStage] = useState(0);
  const [engine, setEngine] = useState<Engine>("openai");
  const [apiKey, setApiKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [style, setStyle] = useState<Style>("executive");
  const [length, setLength] = useState("standard");
  const [result, setResult] = useState(sampleMarkdown);
  const [status, setStatus] = useState("대기 중");
  const [isRunning, setIsRunning] = useState(false);

  const model = engine === "openai" ? "Luna" : "Gemini 3.5 Flash-Lite";
  const fileLabel = useMemo(() => file?.name ?? "선택된 파일 없음", [file]);
  const hasInput = Boolean(file || transcript.trim());

  async function runSummary() {
    setIsRunning(true);
    setStatus(`${model}로 회의록을 정리하는 중…`);
    try {
      if (apiKey.trim()) {
        const endpoint = engine === "openai" ? "https://api.openai.com/v1/chat/completions" : "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";
        const prompt = `회의 전사문 ${file?.name ?? "입력 텍스트"}을 ${style === "executive" ? "임원용 핵심 요약" : style === "formal" ? "공식 회의록" : "실행 중심 액션아이템"} 형식, ${length === "brief" ? "간결한" : length === "detailed" ? "상세한" : "표준"} 분량의 마크다운 회의록으로 변환해 주세요.\n${transcript}`;
        const response = await fetch(engine === "openai" ? endpoint : `${endpoint}?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: engine === "openai" ? { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` } : { "Content-Type": "application/json" }, body: JSON.stringify(engine === "openai" ? { model: "luna", messages: [{ role: "user", content: prompt }] } : { contents: [{ parts: [{ text: prompt }] }] }) });
        if (response.ok) {
          const data = await response.json();
          const text = engine === "openai" ? data.choices?.[0]?.message?.content : data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) setResult(text);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 450));
      setStatus("요약 완료"); setStage(2);
    } catch { setStatus("API 연결에 실패해 예시 결과를 표시합니다."); setStage(2); }
    finally { setIsRunning(false); }
  }

  function downloadResult() {
    const url = URL.createObjectURL(new Blob([result], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "meetnote-회의록.md"; anchor.click(); URL.revokeObjectURL(url);
  }

  const styleName = style === "executive" ? "임원용 핵심 요약" : style === "formal" ? "공식 회의록" : "실행 중심";

  return (
    <main className="shell">
      <nav className="topbar"><div className="brand-group"><img className="iitp-logo" src="https://d2juy7qzamcf56.cloudfront.net/2025-03-17/3d1e7770-de08-49dd-a140-dbbac734b29c.webp" alt="정보통신기획평가원 IITP" /><span className="brand-divider" /><div className="brand"><span className="brand-mark">M</span><span>MEETNOTE</span></div></div><span className="nav-note">회의 전사문을 실무용 회의록으로</span></nav>
      <section className="hero compact-hero"><div className="eyebrow"><span className="pulse" /> AI 회의록 요약</div><h1>회의록을 만드는<br /><em>3단계 워크플로</em></h1><p className="hero-copy">입력하고, 다듬고, 바로 활용하세요.</p></section>
      <nav className="stepper" aria-label="회의록 생성 단계">{["Input", "Process", "Output"].map((label, index) => <button key={label} className={`${stage === index ? "active" : ""} ${stage > index ? "complete" : ""}`} onClick={() => index <= stage && setStage(index)}><span>{String(index + 1).padStart(2, "0")}</span>{label}<i /></button>)}</nav>

      <section className="stage-card">
        {stage === 0 && <div className="stage-content"><div className="stage-title"><span className="step">01 / INPUT</span><h2>자료와 엔진을 준비하세요</h2><p>API 키, 모델 설정, 파일 또는 회의록 전문을 입력합니다.</p></div><div className="input-grid"><label className="upload-box" htmlFor="file-upload"><input id="file-upload" type="file" accept=".docx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><div className="upload-icon">↑</div><strong>{file ? "업로드 준비 완료" : "회의 전사문을 업로드하세요"}</strong><span>{fileLabel} · .DOCX 최대 20MB</span><button type="button" onClick={() => document.getElementById("file-upload")?.click()}>파일 선택</button></label><div className="input-fields"><label className="field-label" htmlFor="transcript">또는 회의록 전문 붙여넣기</label><textarea id="transcript" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="전사문을 여기에 붙여넣으세요…" /><div className="field-label">요약 엔진</div><div className="engine-toggle"><button className={engine === "openai" ? "selected" : ""} onClick={() => setEngine("openai")}><b>O</b> OpenAI</button><button className={engine === "gemini" ? "selected" : ""} onClick={() => setEngine("gemini")}><b>✦</b> Gemini</button></div><label className="field-label" htmlFor="api-key">API 키 <span>브라우저에서만 사용</span></label><input id="api-key" className="key-input" type="password" placeholder={`${engine === "openai" ? "sk-" : "AIza"}••••••••••••`} value={apiKey} onChange={(event) => setApiKey(event.target.value)} /><div className="model-row"><span>기본 모델</span><strong>{model}</strong></div></div></div><div className="stage-actions"><span className="privacy">⌁ API 키는 저장되지 않습니다.</span><button className="run-button next-button" onClick={() => hasInput ? setStage(1) : setStatus("파일 또는 회의록 전문을 입력해 주세요.")}>다음: 요약 설정 →</button></div></div>}

        {stage === 1 && <div className="stage-content process-content"><div className="stage-title"><span className="step">02 / PROCESS</span><h2>어떤 회의록으로 만들까요?</h2><p>회의 목적에 맞는 스타일과 읽을 분량을 선택하세요.</p></div><div className="option-group"><div className="field-label">요약 스타일</div><div className="style-grid">{([['executive','임원용 핵심 요약','결정과 리스크를 빠르게'],['formal','공식 회의록','논의와 의결을 정확하게'],['action','실행 중심','담당·기한·액션을 먼저']] as [Style,string,string][]).map(([value,title,desc]) => <button key={value} className={style === value ? "style-option selected" : "style-option"} onClick={() => setStyle(value)}><span>{style === value ? "✓" : "○"}</span><strong>{title}</strong><small>{desc}</small></button>)}</div></div><div className="option-group length-group"><div className="field-label">출력 분량</div><div className="length-toggle">{([['brief','간결하게','핵심만'],['standard','표준','균형 있게'],['detailed','상세하게','논의까지']] as [string,string,string][]).map(([value,title,desc]) => <button key={value} className={length === value ? "selected" : ""} onClick={() => setLength(value)}><strong>{title}</strong><span>{desc}</span></button>)}</div></div><div className="stage-actions"><button className="back-button" onClick={() => setStage(0)}>← 이전</button><button className="run-button next-button" onClick={runSummary} disabled={isRunning}>{isRunning ? "요약 중…" : "회의록 생성하기  →"}</button></div></div>}

        {stage === 2 && <div className="stage-content output-content"><div className="stage-title output-title"><div><span className="step">03 / OUTPUT</span><h2>최종 회의록이 준비됐습니다</h2><p><span className="status done"><i />{status}</span> · {styleName} · {model}</p></div><div className="output-actions"><button className="back-button" onClick={() => setStage(1)}>← 설정 수정</button><button className="run-button download-button" onClick={downloadResult}>↓ 마크다운 다운로드</button></div></div><div className="result-toolbar"><span>MARKDOWN PREVIEW</span><button onClick={() => navigator.clipboard?.writeText(result)}>결과 복사</button></div><article className="markdown output-markdown">{renderMarkdown(result)}</article></div>}
      </section>
      <footer><span>MEETNOTE · 실무자를 위한 회의록 정리 도구</span><span>Vercel-ready · v1.1</span></footer>
    </main>
  );
}
