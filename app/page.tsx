"use client";

import { ChangeEvent, DragEvent, ReactNode, useMemo, useState } from "react";
import mammoth from "mammoth";

type Provider = "openai" | "gemini";
type Step = 1 | 2 | 3;
type SummaryStyle = "executive" | "decisions" | "detailed" | "action";
type SummaryLength = "concise" | "standard" | "detailed";

const modelOptions: Record<Provider, { label: string; value: string }[]> = {
  openai: [
    { label: "Luna (기본)", value: "luna" },
    { label: "GPT-4.1", value: "gpt-4.1" },
  ],
  gemini: [
    { label: "Gemini 3.5 Flash-Lite (기본)", value: "gemini-3.5-flash-lite" },
    { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
  ],
};

const styleOptions: { value: SummaryStyle; label: string; description: string }[] = [
  { value: "executive", label: "임원용 브리핑", description: "핵심 결론과 리스크를 빠르게" },
  { value: "decisions", label: "결정사항 중심", description: "합의 내용과 보류 안건을 선명하게" },
  { value: "detailed", label: "상세 회의록", description: "논의 흐름과 근거까지 꼼꼼하게" },
  { value: "action", label: "실행 중심", description: "담당자·기한·다음 행동을 우선" },
];

const lengthOptions: { value: SummaryLength; label: string; description: string }[] = [
  { value: "concise", label: "짧게", description: "1~2페이지" },
  { value: "standard", label: "표준", description: "핵심과 근거 균형" },
  { value: "detailed", label: "자세히", description: "논의 맥락까지 포함" },
];

const systemPrompt = `당신은 실무 회의록 편집자입니다. 아래 회의 전사문을 한국어 회의록으로 변환하세요.

사실성 규칙:
- 전사문에 없는 날짜, 참석자, 담당자, 기한, 수치, 원인, 결론을 만들지 마세요.
- 명시적으로 합의된 내용만 결정사항으로 분류하세요.
- 담당자와 기한은 전사문에 명시된 경우만 채우고, 없으면 각각 "담당자 미확인", "기한 미정"으로 표시하세요.
- 불확실한 내용은 추정하지 말고 [전사 불명확: 내용]으로 표시하세요.
- 말버릇과 반복은 제거하되, 실행에 필요한 조건·예외·수치는 보존하세요.

출력 구조:
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

function inlineMarkdown(value: string): ReactNode {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((piece, index) => {
    if (piece.startsWith("**") && piece.endsWith("**")) return <strong key={index}>{piece.slice(2, -2)}</strong>;
    if (piece.startsWith("`") && piece.endsWith("`")) return <code key={index}>{piece.slice(1, -1)}</code>;
    return piece;
  });
}

function markdownBlocks(markdown: string): ReactNode[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let ordered = false;
  let table: string[][] = [];
  const flushList = () => {
    if (!list.length) return;
    const Tag = ordered ? "ol" : "ul";
    blocks.push(<Tag className="markdown-list" key={`list-${blocks.length}`}>{list.map((item, index) => <li key={`${item}-${index}`}>{inlineMarkdown(item)}</li>)}</Tag>);
    list = [];
  };
  const flushTable = () => {
    if (!table.length) return;
    const [head, ...rows] = table;
    blocks.push(<div className="markdown-table-wrap" key={`table-${blocks.length}`}><table className="markdown-table"><thead><tr>{head.map((cell, index) => <th key={`${cell}-${index}`}>{inlineMarkdown(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={`row-${rowIndex}`}>{row.map((cell, index) => <td key={`${cell}-${index}`}>{inlineMarkdown(cell)}</td>)}</tr>)}</tbody></table></div>);
    table = [];
  };
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const isTableRow = trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.split("|").length > 2;
    if (isTableRow) {
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

async function requestSummary(provider: Provider, apiKey: string, model: string, transcript: string, style: SummaryStyle, length: SummaryLength) {
  const styleLabel = styleOptions.find((option) => option.value === style)?.label;
  const lengthLabel = lengthOptions.find((option) => option.value === length)?.label;
  const prompt = `${systemPrompt}\n\n요약 스타일: ${styleLabel}\n출력 분량: ${lengthLabel}\n\n전사문:\n${transcript}`;
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, input: prompt }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "OpenAI API 요청에 실패했습니다.");
    const text = data.output_text || data.output?.flatMap((item: { content?: { text?: string }[] }) => item.content || []).map((item: { text?: string }) => item.text || "").join("");
    if (!text) throw new Error("OpenAI 응답에서 회의록 본문을 찾지 못했습니다.");
    return text;
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Gemini API 요청에 실패했습니다.");
  const text = data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("");
  if (!text) throw new Error("Gemini 응답에서 회의록 본문을 찾지 못했습니다.");
  return text;
}

export default function Home() {
  const [step, setStep] = useState<Step>(1);
  const [provider, setProvider] = useState<Provider>("openai");
  const [model, setModel] = useState(modelOptions.openai[0].value);
  const [apiKey, setApiKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [style, setStyle] = useState<SummaryStyle>("executive");
  const [length, setLength] = useState<SummaryLength>("standard");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const renderedResult = useMemo(() => markdownBlocks(result), [result]);

  function changeProvider(nextProvider: Provider) { setProvider(nextProvider); setModel(modelOptions[nextProvider][0].value); }
  async function readDocx(nextFile: File) {
    setError("");
    if (!nextFile.name.toLowerCase().endsWith(".docx")) { setError(".docx 파일만 업로드할 수 있습니다."); return; }
    try {
      const extracted = await mammoth.extractRawText({ arrayBuffer: await nextFile.arrayBuffer() });
      if (!extracted.value.trim()) throw new Error("empty");
      setFile(nextFile); setTranscript(extracted.value.trim());
    } catch { setError("DOCX 파일을 읽지 못했습니다. 파일이 손상되지 않았는지 확인해주세요."); }
  }
  function handleFile(event: ChangeEvent<HTMLInputElement>) { const nextFile = event.target.files?.[0]; if (nextFile) void readDocx(nextFile); }
  function handleDrop(event: DragEvent<HTMLLabelElement>) { event.preventDefault(); setIsDragging(false); const nextFile = event.dataTransfer.files?.[0]; if (nextFile) void readDocx(nextFile); }
  function goToProcess() {
    setError("");
    if (!apiKey.trim()) { setError("API 키를 입력해주세요."); return; }
    if (!transcript.trim()) { setError("DOCX 파일을 업로드하거나 회의록 전문을 붙여 넣어주세요."); return; }
    setStep(2);
  }
  async function generate() {
    setError(""); setIsLoading(true);
    try { setResult(await requestSummary(provider, apiKey.trim(), model, transcript.trim(), style, length)); setStep(3); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "요약 중 오류가 발생했습니다."); }
    finally { setIsLoading(false); }
  }
  function downloadResult() {
    const blob = new Blob([result], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${file?.name.replace(/\.docx$/i, "") || "meeting-minutes"}.md`; anchor.click(); URL.revokeObjectURL(url);
  }
  function reset() { setStep(1); setResult(""); setError(""); setFile(null); setTranscript(""); }

  const steps = [{ number: 1, label: "Input", sub: "자료 입력" }, { number: 2, label: "Process", sub: "요약 설정" }, { number: 3, label: "Output", sub: "결과 확인" }];
  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#top" aria-label="회의록 요약 홈"><span className="brand-mark">M</span><span>MEETING<br /><b>MINUTES</b></span></a><span className="topbar-meta"><span className="status-dot" />3-STAGE WORKSPACE</span></header>
    <section className="intro" id="top"><div><p className="eyebrow">TRANSCRIPT → CLARITY</p><h1>회의록을 만드는<br /><em>세 번의 짧은 화면.</em></h1><p className="intro-copy">입력하고, 정하고, 확인하세요. 긴 전사문이 실행 가능한 회의록으로 정리됩니다.</p></div><div className="intro-note"><span>WORKFLOW NOTE</span><strong>한 화면에는<br />한 가지 결정만.</strong></div></section>
    <nav className="stepper" aria-label="회의록 작성 단계">{steps.map((item, index) => <button key={item.number} type="button" className={`${step === item.number ? "current" : ""} ${step > item.number ? "done" : ""}`} onClick={() => item.number < step && setStep(item.number as Step)}><span className="step-number">{step > item.number ? "✓" : `0${item.number}`}</span><span><b>{item.label}</b><small>{item.sub}</small></span>{index < steps.length - 1 && <i>→</i>}</button>)}</nav>

    <section className="stage-wrap" aria-live="polite">
      {step === 1 && <section className="stage-card input-stage"><div className="stage-heading"><div><p className="eyebrow">01 / INPUT</p><h2>회의에 필요한 자료를 넣으세요</h2><p>API 키와 원문을 준비하면 다음 단계로 넘어갈 수 있습니다.</p></div><span className="stage-badge">필수 입력</span></div><div className="input-columns"><div className="source-card"><div className="card-label"><span className="card-index">A</span><strong>회의록 전문</strong><span>DOCX 또는 직접 입력</span></div><label className={`dropzone ${isDragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}><input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFile} /><span className="upload-icon">↑</span><strong>{file ? file.name : "DOCX 파일을 올리세요"}</strong><span>{file ? `${(file.size / 1024).toFixed(0)} KB · 텍스트 추출 완료` : "클릭 또는 드래그 · 최대 25MB"}</span></label><textarea value={transcript} onChange={(event) => { setTranscript(event.target.value); setFile(null); }} placeholder="또는 회의록 전문을 여기에 붙여 넣으세요." aria-label="회의록 전문" /><div className="privacy-note"><span className="lock-shape" /> 원문과 키는 저장하지 않습니다.</div></div><div className="settings-card"><div className="card-label"><span className="card-index">B</span><strong>요약 엔진</strong><span>사용자 키 입력</span></div><div className="provider-toggle" role="group" aria-label="요약 엔진"><button type="button" className={provider === "openai" ? "active" : ""} onClick={() => changeProvider("openai")}><span className="provider-dot openai-dot" />OpenAI</button><button type="button" className={provider === "gemini" ? "active" : ""} onClick={() => changeProvider("gemini")}><span className="provider-dot gemini-dot" />Gemini</button></div><label className="field-label">모델 설정<select value={model} onChange={(event) => setModel(event.target.value)}>{modelOptions[provider].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="field-label">API 키<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={`${provider === "openai" ? "sk-" : "AIza"}...`} autoComplete="off" /></label><p className="key-hint">요청 시 브라우저에서만 사용되며 서버에 전송·저장되지 않습니다.</p></div></div>{error && <p className="error-message" role="alert">{error}</p>}<div className="stage-actions end"><button className="primary-button" type="button" onClick={goToProcess}>다음: 요약 설정 <span>→</span></button></div></section>}

      {step === 2 && <section className="stage-card process-stage"><div className="stage-heading"><div><p className="eyebrow">02 / PROCESS</p><h2>어떤 회의록으로 만들까요?</h2><p>회의 목적에 맞는 톤과 분량을 선택하세요.</p></div><span className="stage-badge">스타일 설정</span></div><div className="process-grid"><div><div className="section-title"><span className="card-index">A</span><strong>요약 스타일</strong></div><div className="choice-grid">{styleOptions.map((option) => <button key={option.value} type="button" className={`choice-card ${style === option.value ? "selected" : ""}`} onClick={() => setStyle(option.value)}><span className="choice-mark">{style === option.value ? "✓" : ""}</span><strong>{option.label}</strong><small>{option.description}</small></button>)}</div><div className="section-title length-title"><span className="card-index">B</span><strong>출력 분량</strong></div><div className="length-toggle">{lengthOptions.map((option) => <button key={option.value} type="button" className={length === option.value ? "active" : ""} onClick={() => setLength(option.value)}><strong>{option.label}</strong><small>{option.description}</small></button>)}</div></div><aside className="process-summary"><p className="eyebrow">READY TO RUN</p><h3>현재 설정</h3><dl><div><dt>엔진</dt><dd>{provider === "openai" ? "OpenAI" : "Gemini"}</dd></div><div><dt>모델</dt><dd>{modelOptions[provider].find((option) => option.value === model)?.label || model}</dd></div><div><dt>원문</dt><dd>{file?.name || "직접 입력한 전문"}</dd></div><div><dt>스타일</dt><dd>{styleOptions.find((option) => option.value === style)?.label}</dd></div><div><dt>분량</dt><dd>{lengthOptions.find((option) => option.value === length)?.label}</dd></div></dl><div className="summary-lock"><span className="lock-shape" /> 이 설정으로 바로 생성합니다.</div></aside></div>{error && <p className="error-message" role="alert">{error}</p>}<div className="stage-actions"><button className="secondary-button" type="button" onClick={() => setStep(1)}>← 이전</button><button className="primary-button" type="button" onClick={() => void generate()} disabled={isLoading}>{isLoading ? <><span className="spinner" />회의록 생성 중…</> : <>회의록 생성하기 <span>→</span></>}</button></div></section>}

      {step === 3 && <section className="stage-card output-stage"><div className="stage-heading"><div><p className="eyebrow">03 / OUTPUT</p><h2>회의록이 준비됐습니다</h2><p>검토한 뒤 마크다운 파일로 다운로드하거나 처음부터 다시 시작할 수 있습니다.</p></div><span className="stage-badge success">완료</span></div><div className="output-toolbar"><span><i className="status-dot" />{file?.name || "회의록 전문"}</span><div><button type="button" className="secondary-button small" onClick={downloadResult}>↓ 마크다운 다운로드</button><button type="button" className="secondary-button small" onClick={() => navigator.clipboard?.writeText(result)}>복사</button></div></div><article className="result-paper">{renderedResult}</article><div className="stage-actions"><button className="secondary-button" type="button" onClick={() => setStep(2)}>← 설정 수정</button><button className="primary-button" type="button" onClick={reset}>새 회의록 만들기 <span>↗</span></button></div></section>}
    </section>
    <footer><span>MEETING MINUTES / 2026</span><span>입력 · 처리 · 출력</span></footer>
  </main>;
}
