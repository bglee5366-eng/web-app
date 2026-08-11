"use client";

import { ChangeEvent, DragEvent, FormEvent, ReactNode, useMemo, useState } from "react";
import mammoth from "mammoth";

type Provider = "openai" | "gemini";

const modelOptions: Record<Provider, { label: string; value: string }> = {
  openai: { label: "Luna", value: "luna" },
  gemini: { label: "Gemini 3.5 Flash-Lite", value: "gemini-3.5-flash-lite" },
};

const sampleResult = `# 회의록

- 회의명: 2026년 2분기 제품 운영 회의
- 일시: 2026년 8월 11일
- 참석자: 제품팀, 운영팀, 디자인팀
- 관련 프로젝트/팀: 회의록 요약 서비스

## 1. 한눈에 보는 요약

신규 회의록 요약 서비스의 베타 공개 범위와 사용자 피드백 수집 방식을 논의했습니다. 8월 마지막 주에 내부 베타를 시작하고, 첫 주에는 핵심 흐름과 요약 품질을 집중 점검하기로 했습니다.

## 2. 주요 논의

### 베타 공개 범위

- 논의 요지: 문서 업로드와 요약 결과 확인을 우선 제공
- 주요 의견/근거: 사용자가 가장 빠르게 가치를 확인할 수 있는 핵심 흐름이기 때문
- 현재 상태: 내부 베타 범위로 합의

## 3. 결정사항

- 8월 마지막 주에 내부 베타를 시작한다.
- 초기 베타에서는 회의록 업로드와 마크다운 결과 확인에 집중한다.

## 4. 액션 아이템

| # | 할 일 | 담당자 | 기한 | 상태/비고 |
|---|---|---|---|---|
| 1 | 베타용 업로드 흐름 점검 | 운영팀 | 8월 20일 | 진행 예정 |
| 2 | 요약 품질 검수 기준 작성 | 제품팀 | 기한 미정 | 후속 논의 필요 |

## 5. 미해결 이슈 및 리스크

- 외부 고객 공개 시 지원할 파일 형식은 추가 확인이 필요합니다.

## 6. 다음 일정

- 다음 회의 또는 후속 일정: 내부 베타 시작 전 점검 회의
- 준비할 자료: 업로드 오류 목록, 요약 품질 검수 기준`;

const systemPrompt = `당신은 실무 회의록 편집자입니다. 아래 회의 전사문을 한국어 회의록으로 변환하세요.

규칙:
- 전사문에 없는 날짜, 참석자, 담당자, 기한, 수치, 원인, 결론을 만들지 마세요.
- 명시적으로 합의된 내용만 결정사항으로 분류하세요.
- 담당자와 기한은 전사문에 명시된 경우만 채우고, 없으면 각각 "담당자 미확인", "기한 미정"으로 표시하세요.
- 불확실한 내용은 추정하지 말고 [전사 불명확: 내용]으로 표시하세요.
- 말버릇과 반복은 제거하되, 실행에 필요한 조건·예외·수치는 보존하세요.
- 아래 마크다운 구조를 지키세요.

# 회의록
- 회의명:
- 일시:
- 참석자:
- 관련 프로젝트/팀:

## 1. 한눈에 보는 요약
## 2. 주요 논의
## 3. 결정사항
## 4. 액션 아이템
| # | 할 일 | 담당자 | 기한 | 상태/비고 |
## 5. 미해결 이슈 및 리스크
## 6. 다음 일정`;

function markdownBlocks(markdown: string): ReactNode[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let ordered = false;
  let table: string[][] = [];

  const flushList = () => {
    if (!list.length) return;
    const Tag = ordered ? "ol" : "ul";
    blocks.push(
      <Tag className="markdown-list" key={`list-${blocks.length}`}>
        {list.map((item, index) => <li key={`${item}-${index}`}>{inlineMarkdown(item)}</li>)}
      </Tag>,
    );
    list = [];
  };

  const flushTable = () => {
    if (!table.length) return;
    const [head, ...rows] = table;
    blocks.push(
      <div className="markdown-table-wrap" key={`table-${blocks.length}`}>
        <table className="markdown-table">
          <thead><tr>{head.map((cell, index) => <th key={`${cell}-${index}`}>{inlineMarkdown(cell)}</th>)}</tr></thead>
          <tbody>{rows.map((row, rowIndex) => <tr key={`row-${rowIndex}`}>{row.map((cell, index) => <td key={`${cell}-${index}`}>{inlineMarkdown(cell)}</td>)}</tr>)}</tbody>
        </table>
      </div>,
    );
    table = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const tableRow = trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.split("|").length > 2;
    if (tableRow) {
      flushList();
      const cells = trimmed.slice(1, -1).split("|").map((cell) => cell.trim());
      if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) table.push(cells);
      return;
    }
    flushTable();
    if (!trimmed) { flushList(); return; }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      const Tag = heading[1].length === 1 ? "h2" : heading[1].length === 2 ? "h3" : "h4";
      blocks.push(<Tag key={`heading-${index}`}>{inlineMarkdown(heading[2])}</Tag>);
      return;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) { if (list.length && ordered) flushList(); ordered = false; list.push(bullet[1]); return; }
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) { if (list.length && !ordered) flushList(); ordered = true; list.push(numbered[1]); return; }
    flushList();
    blocks.push(<p key={`paragraph-${index}`}>{inlineMarkdown(trimmed)}</p>);
  });
  flushList();
  flushTable();
  return blocks;
}

function inlineMarkdown(value: string): ReactNode {
  const pieces = value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return pieces.map((piece, index) => {
    if (piece.startsWith("**") && piece.endsWith("**")) return <strong key={index}>{piece.slice(2, -2)}</strong>;
    if (piece.startsWith("`") && piece.endsWith("`")) return <code key={index}>{piece.slice(1, -1)}</code>;
    return piece;
  });
}

async function requestSummary(provider: Provider, apiKey: string, transcript: string) {
  const model = modelOptions[provider].value;
  const prompt = `${systemPrompt}\n\n전사문:\n${transcript}`;
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: prompt }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "OpenAI API 요청에 실패했습니다.");
    const text = data.output_text || data.output?.flatMap((item: { content?: { text?: string }[] }) => item.content || []).map((item: { text?: string }) => item.text || "").join("");
    if (!text) throw new Error("OpenAI 응답에서 회의록 본문을 찾지 못했습니다.");
    return text;
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Gemini API 요청에 실패했습니다.");
  const text = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("");
  if (!text) throw new Error("Gemini 응답에서 회의록 본문을 찾지 못했습니다.");
  return text;
}

export default function Home() {
  const [provider, setProvider] = useState<Provider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const renderedResult = useMemo(() => markdownBlocks(result || sampleResult), [result]);

  async function readDocx(nextFile: File) {
    setError("");
    if (!nextFile.name.toLowerCase().endsWith(".docx")) { setError(".docx 파일만 업로드할 수 있습니다."); return; }
    try {
      const extracted = await mammoth.extractRawText({ arrayBuffer: await nextFile.arrayBuffer() });
      if (!extracted.value.trim()) throw new Error("문서에서 읽을 수 있는 텍스트가 없습니다.");
      setFile(nextFile);
      setTranscript(extracted.value.trim());
      setResult("");
    } catch { setError("DOCX 파일을 읽지 못했습니다. 파일이 손상되지 않았는지 확인해주세요."); }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) { const nextFile = event.target.files?.[0]; if (nextFile) void readDocx(nextFile); }
  function handleDrop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); setIsDragging(false); const nextFile = event.dataTransfer.files?.[0]; if (nextFile) void readDocx(nextFile); }
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!apiKey.trim()) { setError("선택한 요약 엔진의 API 키를 입력해주세요."); return; }
    if (!transcript.trim()) { setError("먼저 회의 전사문 DOCX 파일을 업로드해주세요."); return; }
    setIsLoading(true);
    try { setResult(await requestSummary(provider, apiKey.trim(), transcript)); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "요약 중 오류가 발생했습니다."); }
    finally { setIsLoading(false); }
  }

  return (
    <main className="site-shell">
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="회의록 요약 홈"><span className="brand-mark">M</span><span>MEETING<br /><b>MINUTES</b></span></a>
        <div className="topbar-meta"><span className="status-dot" />브라우저에서 바로 시작</div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">TRANSCRIPT → CLARITY</p>
          <h1>길어진 회의,<br /><em>결론만 선명하게.</em></h1>
          <p className="hero-lede">회의 전사문을 올리면 결정사항과 액션 아이템이 살아 있는 실무 회의록으로 정리됩니다.</p>
          <div className="trust-row"><span>✓ 전사문 사실성 우선</span><span>✓ 마크다운 결과</span><span>✓ 키는 저장하지 않음</span></div>
        </div>
        <div className="hero-note"><span className="note-number">01</span><p>회의의 흐름은 줄이고,<br /><strong>다음 행동은 남깁니다.</strong></p></div>
      </section>

      <section className="workspace-grid" aria-label="회의록 요약 도구">
        <form className="input-panel" onSubmit={handleSubmit}>
          <div className="panel-heading"><div><p className="eyebrow">01 / INPUT</p><h2>회의 전사문 넣기</h2></div><span className="step-chip">DOCX</span></div>
          <label className={`dropzone ${isDragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}>
            <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFile} />
            <span className="upload-icon" aria-hidden="true">↑</span>
            <strong>{file ? file.name : "DOCX 파일을 여기에 놓으세요"}</strong>
            <span>{file ? `${(file.size / 1024).toFixed(0)} KB · 텍스트 추출 완료` : "또는 클릭해서 파일 선택 · 최대 25MB"}</span>
          </label>
          <div className="privacy-note"><span className="lock-shape" /> 파일은 이 브라우저에서만 읽고, 서버에 저장하지 않습니다.</div>

          <div className="engine-section"><div className="section-label"><p className="eyebrow">02 / ENGINE</p><span>요약 엔진 선택</span></div>
            <div className="provider-toggle" role="group" aria-label="요약 엔진">
              <button type="button" className={provider === "openai" ? "active" : ""} onClick={() => setProvider("openai")}><span className="provider-dot openai-dot" />OpenAI</button>
              <button type="button" className={provider === "gemini" ? "active" : ""} onClick={() => setProvider("gemini")}><span className="provider-dot gemini-dot" />Gemini</button>
            </div>
            <div className="field-row"><label>기본 모델<select value={modelOptions[provider].value} disabled aria-label="기본 모델"><option value={modelOptions[provider].value}>{modelOptions[provider].label}</option></select></label><label>API 키<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={`${provider === "openai" ? "sk-" : "AIza"}...`} autoComplete="off" /></label></div>
            <p className="key-hint">키는 요청 시에만 사용되며 저장하거나 로그로 남기지 않습니다.</p>
          </div>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={isLoading}>{isLoading ? <><span className="spinner" />회의록 만드는 중…</> : <>회의록 만들기 <span>↗</span></>}</button>
        </form>

        <section className="result-panel" aria-live="polite">
          <div className="panel-heading"><div><p className="eyebrow">03 / OUTPUT</p><h2>정리된 회의록</h2></div><span className="result-state">{result ? "완료" : "미리보기"}</span></div>
          <div className="result-paper">{renderedResult}</div>
          {!result && <div className="preview-overlay"><span>업로드 후 실제 결과가 여기에 표시됩니다</span></div>}
        </section>
      </section>

      <section className="workflow-strip"><div><span className="strip-num">A</span><strong>업로드</strong><span>DOCX 전사문을 넣고</span></div><span className="strip-arrow">→</span><div><span className="strip-num">B</span><strong>선택</strong><span>원하는 엔진을 고르고</span></div><span className="strip-arrow">→</span><div><span className="strip-num">C</span><strong>실행</strong><span>공유 가능한 회의록 완성</span></div></section>
      <footer><span>MEETING MINUTES / 2026</span><span>회의를 기록하는 가장 가벼운 방법</span></footer>
    </main>
  );
}
